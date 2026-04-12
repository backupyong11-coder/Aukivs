"""Google Sheets '업로드운영' 탭에서 업로드 행을 읽고, 일부 열만 갱신합니다."""

from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from config import Settings
from schemas import (
    UploadDuplicateIdIssue,
    UploadItem,
    UploadListItem,
    UploadListResponse,
    UploadRowSkippedIssue,
)

from .sheet_row_messages import format_upload_duplicate_id

from .google_sheets import (
    append_rows_to_sheet_range,
    batch_update_sheet_values,
    get_worksheet_id_by_title,
    read_sheet_tab_values,
    spreadsheet_id_from_url,
    spreadsheets_batch_update,
)
from .sheet_cell_utils import padded_row_cells, row_all_blank_strings
from .sheets_errors import (
    SheetsConfigurationError,
    SheetsInvalidStateError,
    SheetsNotFoundError,
    SheetsParseError,
)

_SEOUL = ZoneInfo("Asia/Seoul")
_TERMINAL_UPLOAD_STATUSES = frozenset({"완료", "보관", "중단"})
_NEXT_EPISODE_ALLOWED = frozenset({"대기", "검수중", "작업중"})
_UPLOADS_COLS = 11
_UPLOAD_STATUS_COMPLETE = "업로드 완료"


def _uploads_a1_range(tab_name: str) -> str:
    """A~K: 완료, 업로드일, 플랫폼명, 작품명, 업로드완료여부, …"""
    escaped = tab_name.replace("'", "''")
    return f"'{escaped}'!A2:K"


def _upload_checkbox_done(cell: str) -> bool:
    s = (cell or "").strip().upper()
    return s in ("TRUE", "1", "YES", "Y")


def _upload_item_status(cells: list[str]) -> str | None:
    """
    API status: A=TRUE 이거나 E='업로드 완료'이면 '업로드 완료',
    그 외에는 E열 값 그대로(비어 있으면 None).
    """
    if not cells:
        return None
    if _upload_checkbox_done(cells[0]):
        return _UPLOAD_STATUS_COMPLETE
    e = cells[4] if len(cells) > 4 else ""
    e_stripped = e.strip()
    if e_stripped == _UPLOAD_STATUS_COMPLETE:
        return _UPLOAD_STATUS_COMPLETE
    return e_stripped if e_stripped else None


def _row_all_blank(row: list[object], width: int) -> bool:
    return row_all_blank_strings(padded_row_cells(row, width))


def _upload_sheet_rows(settings: Settings) -> tuple[Path, str, list[list[object]]]:
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 "
            "backend/.env 등에 설정하세요. "
            "(선택) GOOGLE_UPLOADS_TAB 으로 업로드 탭 이름을 바꿀 수 있습니다(기본: 업로드운영)."
        )

    cred_path = Path(settings.google_service_account_file).expanduser()
    if not cred_path.is_file():
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 JSON 파일을 찾을 수 없습니다: {cred_path.resolve()}"
        )

    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)
    range_a1 = _uploads_a1_range(settings.google_uploads_tab)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    return cred_path, spreadsheet_id, rows


_DEFAULT_FILE_NAME_PLACEHOLDER = "(파일명 미입력)"


def _normalize_uploaded_at_b_cell(raw: str) -> str:
    """
    B열 업로드일을 프론트·달력용 ISO로 맞춥니다.
    YYYY-MM-DD → 해당일 00:00 Asia/Seoul. 이미 ISO 형태면 서울 기준으로 정규화.
    파싱 불가 시 원문(앞뒤 공백 제거) 그대로.
    """
    s = (raw or "").strip()
    if not s:
        return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        try:
            d = date.fromisoformat(s)
            dt = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=_SEOUL)
            return dt.isoformat()
        except ValueError:
            return s
    try:
        s2 = s[:-1] + "+00:00" if s.endswith("Z") else s
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_SEOUL)
        return dt.astimezone(_SEOUL).replace(microsecond=0).isoformat()
    except ValueError:
        return s


def upload_list_uid(item_id: str, uploaded_at: str, sheet_row: int) -> str:
    """GET /uploads 목록·React key용. 동일 id가 여러 행이어도 행·시각으로 구분."""
    return f"upload-{item_id}-{uploaded_at}-{sheet_row}"


def _parse_sheet_row_from_append_updated_range(updated_range: str | None) -> int:
    if not updated_range:
        raise SheetsParseError("[파싱] 행 추가 응답에 updatedRange가 없습니다.")
    m = re.search(r"!([A-Za-z]+)(\d+)", updated_range)
    if not m:
        raise SheetsParseError(
            f"[파싱] append 범위에서 시작 행을 해석할 수 없습니다: {updated_range!r}"
        )
    return int(m.group(2))


def _parse_upload_data_rows(
    rows: list[list[object]], tab: str
) -> tuple[list[tuple[UploadItem, int]], list[UploadDuplicateIdIssue | UploadRowSkippedIssue]]:
    """
    A2:K 행 배열을 파싱합니다.
    - 완전 빈 행: 조용히 건너뜀.
    - 완료 여부와 관계없이 파싱 가능한 행은 모두 포함. status는 A·E 기준으로 정규화.
    - title(D열 작품명) 없음: 조용히 건너뜀.
    - B열이 비어 있어도 D열만 있으면 포함. uploaded_at은 "" 또는 ISO 정규화 값.
    - id는 항상 sheet-row-<행번호>.
    유효 행 기준 동일 id 가 2행 이상이면 duplicate_id 이슈만 추가합니다.
    """
    items: list[tuple[UploadItem, int]] = []
    issues: list[UploadDuplicateIdIssue | UploadRowSkippedIssue] = []
    for i, row in enumerate(rows):
        sheet_row = i + 2
        if _row_all_blank(row, _UPLOADS_COLS):
            continue

        c = padded_row_cells(row if isinstance(row, list) else [], _UPLOADS_COLS)

        uploaded_at_raw = c[1]
        file_name = c[2]
        title = c[3]

        if not title:
            continue
        if not file_name:
            file_name = _DEFAULT_FILE_NAME_PLACEHOLDER

        uploaded_at = _normalize_uploaded_at_b_cell(uploaded_at_raw)

        item_id = f"sheet-row-{sheet_row}"
        note: str | None = None
        status: str | None = _upload_item_status(c)
        items.append(
            (
                UploadItem(
                    id=item_id,
                    title=title,
                    file_name=file_name,
                    uploaded_at=uploaded_at,
                    note=note,
                    status=status,
                ),
                sheet_row,
            )
        )
    id_to_rows: dict[str, list[int]] = {}
    for u, sheet_row in items:
        id_to_rows.setdefault(u.id, []).append(sheet_row)
    for dup_id, row_nums in id_to_rows.items():
        if len(row_nums) < 2:
            continue
        sorted_rows = sorted(row_nums)
        issues.append(
            UploadDuplicateIdIssue(
                id=dup_id,
                sheet_rows=sorted_rows,
                message=format_upload_duplicate_id(tab, dup_id, sorted_rows),
            )
        )
    return items, issues


def fetch_uploads_from_google_sheets(settings: Settings) -> list[UploadItem]:
    """
    AI 제안 등: 파싱 가능한 행만 UploadItem 리스트로 반환합니다.
    문제 행은 조용히 제외합니다(한 행 때문에 전체 실패하지 않음).
    """
    _, _, rows = _upload_sheet_rows(settings)
    tuples, _issues = _parse_upload_data_rows(rows, settings.google_uploads_tab)
    return [u for u, _ in tuples]


def fetch_upload_list_from_google_sheets(settings: Settings) -> UploadListResponse:
    """GET /uploads: 정상 행 + 제외 행 issues."""
    _, _, rows = _upload_sheet_rows(settings)
    tab = settings.google_uploads_tab
    tuples, issues = _parse_upload_data_rows(rows, tab)
    list_items = [
        UploadListItem(
            uid=upload_list_uid(u.id, u.uploaded_at, r),
            **u.model_dump(),
        )
        for u, r in tuples
    ]
    return UploadListResponse(items=list_items, issues=issues)


def fetch_uploads_for_briefing(
    settings: Settings,
) -> tuple[list[tuple[UploadItem, int]], list[str]]:
    """브리핑: 동일 파서 + warnings 문자열."""
    _, _, rows = _upload_sheet_rows(settings)
    items, issues = _parse_upload_data_rows(rows, settings.google_uploads_tab)
    return items, [i.message for i in issues]


def _build_id_to_sheet_row_uploads(settings: Settings) -> tuple[Path, str, dict[str, int]]:
    """
    파싱 가능한 행만 id → 시트 행 번호(1-based).
    POST update/delete/next-episode 는 요청 body 의 id 만으로 행을 찾으며,
    동일 id 가 여러 유효 행에 있으면 마지막 행이 dict 에 남습니다(액션 대상 모호).
    이웃 행의 필수 열 누락으로 조작 API 전체가 막히지는 않습니다.
    """
    cred_path, spreadsheet_id, rows = _upload_sheet_rows(settings)
    tuples, _issues = _parse_upload_data_rows(rows, settings.google_uploads_tab)
    id_to_row: dict[str, int] = {}
    for u, sheet_row in tuples:
        id_to_row[u.id] = sheet_row
    return cred_path, spreadsheet_id, id_to_row


def update_upload_item_in_sheet(
    settings: Settings,
    item_id: str,
    fields: dict[str, str | None],
) -> None:
    """
    요청에 포함된 키만 갱신합니다.
    - note: 시트에 해당 열이 없어 반영하지 않습니다(API 호환용).
    - status: None 또는 빈 문자열이면 E열(업로드완료여부)을 비움
    - uploaded_at: 반드시 비지 않는 문자열(B열 업로드일). 필드가 없으면 B열은 건드리지 않음
    """
    oid = item_id.strip()
    if not oid:
        raise SheetsParseError("[파싱] id가 비어 있습니다.")

    allowed = frozenset({"status", "note", "uploaded_at"})
    extra = set(fields) - allowed
    if extra:
        raise SheetsParseError(f"[파싱] 지원하지 않는 필드입니다: {sorted(extra)}")

    if not fields:
        raise SheetsParseError("[파싱] 수정할 필드가 없습니다.")

    if "uploaded_at" in fields:
        u = fields["uploaded_at"]
        if u is None or not str(u).strip():
            raise SheetsParseError(
                "[파싱] uploaded_at을(를) 비울 수 없습니다. "
                "ISO 8601 형식 문자열을 넣거나 필드를 생략하세요."
            )

    cred_path, spreadsheet_id, id_to_row = _build_id_to_sheet_row_uploads(settings)
    if oid not in id_to_row:
        raise SheetsNotFoundError(
            f"[찾을수없음] 업로드 목록에 없는 id입니다: {oid}"
        )

    if "status" not in fields and "uploaded_at" not in fields:
        return

    row_num = id_to_row[oid]
    tab_esc = settings.google_uploads_tab.replace("'", "''")
    data: list[dict] = []
    if "status" in fields:
        s = fields["status"]
        text = "" if s is None else str(s).strip()
        data.append({"range": f"'{tab_esc}'!E{row_num}", "values": [[text]]})
    if "uploaded_at" in fields:
        data.append(
            {
                "range": f"'{tab_esc}'!B{row_num}",
                "values": [[str(fields["uploaded_at"]).strip()]],
            }
        )

    batch_update_sheet_values(cred_path, spreadsheet_id, data)


def delete_upload_row_by_id(settings: Settings, item_id: str) -> None:
    """
    GET /uploads 와 동일한 규칙으로 id에 해당하는 행을 찾아 통째로 삭제합니다.
    spreadsheets.batchUpdate 의 deleteDimension(ROWS) 를 사용합니다.
    """
    oid = item_id.strip()
    if not oid:
        raise SheetsParseError("[파싱] id가 비어 있습니다.")

    cred_path, spreadsheet_id, id_to_row = _build_id_to_sheet_row_uploads(settings)
    if oid not in id_to_row:
        raise SheetsNotFoundError(
            f"[찾을수없음] 업로드 목록에 없는 id입니다: {oid}"
        )

    sheet_row = id_to_row[oid]
    worksheet_id = get_worksheet_id_by_title(
        cred_path, spreadsheet_id, settings.google_uploads_tab
    )
    spreadsheets_batch_update(
        cred_path,
        spreadsheet_id,
        [
            {
                "deleteDimension": {
                    "range": {
                        "sheetId": worksheet_id,
                        "dimension": "ROWS",
                        "startIndex": sheet_row - 1,
                        "endIndex": sheet_row,
                    }
                }
            }
        ],
    )


def _normalized_upload_status(cell: object | None) -> str | None:
    if cell is None:
        return None
    t = str(cell).strip()
    return t if t else None


def _now_uploaded_at_iso_seoul() -> str:
    """uploads/update 예시와 동일하게 Asia/Seoul 오프셋 ISO 문자열."""
    return datetime.now(_SEOUL).replace(microsecond=0).isoformat()


def create_upload_item_in_sheet(
    settings: Settings,
    *,
    title: str,
    file_name: str | None,
    uploaded_at: str | None,
    note: str | None,
    status: str | None,
) -> UploadItem:
    """
    업로드 탭 맨 아래에 행 1개를 추가합니다.
    A=완료 FALSE, B=업로드일(비우면 서버 시각), C=플랫폼명(비우면 기본 플레이스홀더),
    D=작품명, E=업로드완료여부, F~K 빈칸.
    """
    t = str(title).strip()
    if not t:
        raise SheetsParseError("[파싱] title이 비어 있습니다.")

    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 "
            "backend/.env 등에 설정하세요."
        )

    cred_path = Path(settings.google_service_account_file).expanduser()
    if not cred_path.is_file():
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 JSON 파일을 찾을 수 없습니다: {cred_path.resolve()}"
        )

    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)

    c_raw = (file_name or "").strip()
    c_cell = c_raw if c_raw else _DEFAULT_FILE_NAME_PLACEHOLDER

    b_raw = (uploaded_at or "").strip()
    b_cell = b_raw if b_raw else _now_uploaded_at_iso_seoul()

    e_cell = "" if status is None else str(status).strip()
    _ = note

    tab_esc = settings.google_uploads_tab.replace("'", "''")
    range_a1 = f"'{tab_esc}'!A:K"
    updated_range = append_rows_to_sheet_range(
        cred_path,
        spreadsheet_id,
        range_a1,
        [
            [
                False,
                b_cell,
                c_cell,
                t,
                e_cell,
                "",
                "",
                "",
                "",
                "",
                "",
            ]
        ],
    )
    sheet_row = _parse_sheet_row_from_append_updated_range(updated_range)
    new_id = f"sheet-row-{sheet_row}"

    note_out: str | None = None
    status_out: str | None = e_cell if e_cell else None
    return UploadItem(
        id=new_id,
        title=t,
        file_name=c_cell,
        uploaded_at=b_cell,
        note=note_out,
        status=status_out,
    )


def _next_episode_status_after(current: str | None) -> str:
    """비움·대기 → 검수중 → 작업중 → 완료 (1차 최소 단계 전이)."""
    n = current
    if n is None or n == "대기":
        return "검수중"
    if n == "검수중":
        return "작업중"
    if n == "작업중":
        return "완료"
    raise SheetsInvalidStateError(
        f"[유효하지않은상태] 다음 회차 상태를 결정할 수 없습니다: {current!r}"
    )


def _assert_can_advance_upload_next_episode(status: str | None) -> None:
    if status in _TERMINAL_UPLOAD_STATUSES:
        raise SheetsInvalidStateError(
            f"[유효하지않은상태] 종료 상태({status})에서는 다음 회차로 진행할 수 없습니다."
        )
    if status is None or status in _NEXT_EPISODE_ALLOWED:
        return
    raise SheetsInvalidStateError(
        f"[유효하지않은상태] 다음 회차로 진행할 수 없는 상태입니다: {status!r} "
        f"(허용: 비움, {', '.join(sorted(_NEXT_EPISODE_ALLOWED))})"
    )


def _find_upload_row_for_next_episode(
    settings: Settings,
    item_id: str,
) -> tuple[Path, str, int, str | None]:
    """id에 해당하는 첫 파싱 성공 행의 행 번호와 status(E열)."""
    cred_path, spreadsheet_id, rows = _upload_sheet_rows(settings)
    oid = item_id.strip()
    if not oid:
        raise SheetsParseError("[파싱] id가 비어 있습니다.")

    tuples, _issues = _parse_upload_data_rows(rows, settings.google_uploads_tab)
    for u, sheet_row in tuples:
        if u.id != oid:
            continue
        return cred_path, spreadsheet_id, sheet_row, u.status

    raise SheetsNotFoundError(
        f"[찾을수없음] 업로드 목록에 없는 id입니다: {oid}"
    )


def advance_upload_next_episode(settings: Settings, item_id: str) -> None:
    """
    다음 회차(1차 최소): E열 status를 한 단계 진행하고, B열 uploaded_at을
    서버 시각(Asia/Seoul ISO)으로 갱신합니다. 다른 열은 변경하지 않습니다.
    """
    cred_path, spreadsheet_id, sheet_row, current_status = (
        _find_upload_row_for_next_episode(settings, item_id)
    )
    _assert_can_advance_upload_next_episode(current_status)
    new_status = _next_episode_status_after(current_status)
    new_iso = _now_uploaded_at_iso_seoul()

    tab_esc = settings.google_uploads_tab.replace("'", "''")
    batch_update_sheet_values(
        cred_path,
        spreadsheet_id,
        [
            {"range": f"'{tab_esc}'!E{sheet_row}", "values": [[new_status]]},
            {"range": f"'{tab_esc}'!B{sheet_row}", "values": [[new_iso]]},
        ],
    )
