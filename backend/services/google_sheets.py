"""Google Sheets API 연결: URL에서 스프레드시트 ID 추출, 클라이언트 생성."""

from __future__ import annotations

import json
import re
from pathlib import Path

from google.auth.exceptions import GoogleAuthError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .sheets_errors import (
    SheetsConfigurationError,
    SheetsFetchError,
    SheetsNotFoundError,
)

# 읽기·쓰기(체크리스트 완료 등) 공용
_SCOPES = ("https://www.googleapis.com/auth/spreadsheets",)


def spreadsheet_id_from_url(url: str) -> str:
    """
    docs.google.com 스프레드시트 URL에서 ID를 추출합니다.
    예: https://docs.google.com/spreadsheets/d/<ID>/edit
    """
    raw = (url or "").strip()
    if not raw:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SHEET_URL이 비어 있습니다. 스프레드시트 전체 URL을 넣어주세요."
        )
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", raw)
    if not match:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SHEET_URL에서 스프레드시트 ID를 찾을 수 없습니다. "
            "형식 예: https://docs.google.com/spreadsheets/d/<스프레드시트ID>/edit"
        )
    return match.group(1)


def read_service_account_email(credentials_path: Path) -> str | None:
    try:
        data = json.loads(credentials_path.read_text(encoding="utf-8"))
        email = data.get("client_email")
        return email if isinstance(email, str) else None
    except (OSError, json.JSONDecodeError):
        return None


def build_sheets_service(credentials_path: Path):
    """서비스 계정 JSON으로 Sheets API v4 클라이언트를 만듭니다."""
    try:
        creds = service_account.Credentials.from_service_account_file(
            str(credentials_path),
            scopes=_SCOPES,
        )
    except GoogleAuthError as e:
        raise SheetsFetchError(
            f"[인증] 서비스 계정으로 로그인할 수 없습니다: {e}"
        ) from e
    except ValueError as e:
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 JSON 형식이 올바르지 않습니다: {e}"
        ) from e
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def read_sheet_tab_values(
    cred_path: Path,
    spreadsheet_id: str,
    range_a1: str,
) -> list[list]:
    """
    지정 A1 범위의 값만 조회합니다. HttpError 시 [Sheets API] / [공유] 메시지로 래핑합니다.
    """
    sa_email = read_service_account_email(cred_path)
    try:
        service = build_sheets_service(cred_path)
        result = (
            service.spreadsheets()
            .values()
            .get(
                spreadsheetId=spreadsheet_id,
                range=range_a1,
            )
            .execute()
        )
    except HttpError as e:
        status = e.resp.status if e.resp else "?"
        reason = str(e)
        hint = ""
        if sa_email and status in (403, 404):
            hint = (
                f" [공유] 스프레드시트를 서비스 계정 이메일({sa_email})에 "
                "뷰어 이상으로 공유했는지 확인하세요."
            )
        raise SheetsFetchError(
            f"[Sheets API] HTTP {status}: {reason}.{hint}"
        ) from e
    except SheetsFetchError:
        raise
    except SheetsConfigurationError:
        raise
    except Exception as e:
        raise SheetsFetchError(f"[Sheets API] 요청 중 오류: {e}") from e
    return result.get("values") or []


def batch_update_sheet_values(
    cred_path: Path,
    spreadsheet_id: str,
    data: list[dict],
    *,
    value_input_option: str = "USER_ENTERED",
) -> None:
    """
    spreadsheets.values.batchUpdate 로 여러 범위를 한 번에 갱신합니다.
    data 예: [{"range": "'시트'!D2", "values": [["완료"]]}, ...]
    """
    sa_email = read_service_account_email(cred_path)
    try:
        service = build_sheets_service(cred_path)
        (
            service.spreadsheets()
            .values()
            .batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={
                    "valueInputOption": value_input_option,
                    "data": data,
                },
            )
            .execute()
        )
    except HttpError as e:
        status = e.resp.status if e.resp else "?"
        reason = str(e)
        hint = ""
        if sa_email and status in (403, 404):
            hint = (
                f" [공유] 스프레드시트를 서비스 계정 이메일({sa_email})에 "
                "편집자 이상으로 공유했는지 확인하세요. (읽기 전용이면 완료 처리가 거부됩니다.)"
            )
        raise SheetsFetchError(
            f"[Sheets API] HTTP {status}: {reason}.{hint}"
        ) from e
    except SheetsFetchError:
        raise
    except SheetsConfigurationError:
        raise
    except Exception as e:
        raise SheetsFetchError(f"[Sheets API] 요청 중 오류: {e}") from e


def append_rows_to_sheet_range(
    cred_path: Path,
    spreadsheet_id: str,
    range_a1: str,
    values: list[list],
    *,
    value_input_option: str = "USER_ENTERED",
) -> None:
    """
    spreadsheets.values.append 로 행을 테이블 끝에 추가합니다.
    insertDataOption=INSERT_ROWS 로 기존 행을 덮어쓰지 않습니다.
    """
    sa_email = read_service_account_email(cred_path)
    try:
        service = build_sheets_service(cred_path)
        (
            service.spreadsheets()
            .values()
            .append(
                spreadsheetId=spreadsheet_id,
                range=range_a1,
                valueInputOption=value_input_option,
                insertDataOption="INSERT_ROWS",
                body={"values": values},
            )
            .execute()
        )
    except HttpError as e:
        status = e.resp.status if e.resp else "?"
        reason = str(e)
        hint = ""
        if sa_email and status in (403, 404):
            hint = (
                f" [공유] 스프레드시트를 서비스 계정 이메일({sa_email})에 "
                "편집자 이상으로 공유했는지 확인하세요."
            )
        raise SheetsFetchError(
            f"[Sheets API] HTTP {status}: {reason}.{hint}"
        ) from e
    except SheetsFetchError:
        raise
    except SheetsConfigurationError:
        raise
    except Exception as e:
        raise SheetsFetchError(f"[Sheets API] 요청 중 오류: {e}") from e


def get_worksheet_id_by_title(
    cred_path: Path,
    spreadsheet_id: str,
    tab_title: str,
) -> int:
    """스프레드시트 메타에서 탭 제목으로 sheetId(숫자)를 찾습니다."""
    sa_email = read_service_account_email(cred_path)
    try:
        service = build_sheets_service(cred_path)
        meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    except HttpError as e:
        status = e.resp.status if e.resp else "?"
        reason = str(e)
        hint = ""
        if sa_email and status in (403, 404):
            hint = (
                f" [공유] 스프레드시트를 서비스 계정 이메일({sa_email})에 "
                "공유했는지 확인하세요."
            )
        raise SheetsFetchError(
            f"[Sheets API] HTTP {status}: {reason}.{hint}"
        ) from e
    except SheetsFetchError:
        raise
    except SheetsConfigurationError:
        raise
    except Exception as e:
        raise SheetsFetchError(f"[Sheets API] 요청 중 오류: {e}") from e

    for sheet in meta.get("sheets", []):
        props = sheet.get("properties", {})
        if props.get("title") == tab_title:
            return int(props["sheetId"])
    raise SheetsNotFoundError(
        f"[찾을수없음] 탭 '{tab_title}' 을(를) 스프레드시트에서 찾을 수 없습니다."
    )


def spreadsheets_batch_update(
    cred_path: Path,
    spreadsheet_id: str,
    requests: list[dict],
) -> None:
    """spreadsheets.batchUpdate (행/열 삭제 등 구조 변경)."""
    sa_email = read_service_account_email(cred_path)
    try:
        service = build_sheets_service(cred_path)
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": requests},
        ).execute()
    except HttpError as e:
        status = e.resp.status if e.resp else "?"
        reason = str(e)
        hint = ""
        if sa_email and status in (403, 404):
            hint = (
                f" [공유] 스프레드시트를 서비스 계정 이메일({sa_email})에 "
                "편집자 이상으로 공유했는지 확인하세요."
            )
        raise SheetsFetchError(
            f"[Sheets API] HTTP {status}: {reason}.{hint}"
        ) from e
    except SheetsFetchError:
        raise
    except SheetsConfigurationError:
        raise
    except Exception as e:
        raise SheetsFetchError(f"[Sheets API] 요청 중 오류: {e}") from e
