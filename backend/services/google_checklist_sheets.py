"""Google Sheets '체크리스트' 탭 읽기·완료 처리 (서비스 계정)."""

from __future__ import annotations

import uuid
from pathlib import Path

from config import Settings
from schemas import ChecklistItem

from .google_sheets import (
    append_rows_to_sheet_range,
    batch_update_sheet_values,
    get_worksheet_id_by_title,
    read_sheet_tab_values,
    spreadsheet_id_from_url,
    spreadsheets_batch_update,
)
from .sheets_errors import (
    SheetsConfigurationError,
    SheetsNotFoundError,
    SheetsParseError,
)

_STATUS_DONE = "완료"


def _checklist_row_all_blank(row: list[object], width: int) -> bool:
    padded = list(row) + [""] * width
    for i in range(width):
        cell = padded[i]
        if str(cell if cell is not None else "").strip():
            return False
    return True


def _checklist_read_range(tab_name: str) -> str:
    """A~D: id, title, note, status(선택)."""
    escaped = tab_name.replace("'", "''")
    return f"'{escaped}'!A2:D"


def _row_status(cells: list) -> str:
    if len(cells) < 4:
        return ""
    return str(cells[3] if cells[3] is not None else "").strip()


def fetch_checklist_from_google_sheets(settings: Settings) -> list[ChecklistItem]:
    """
    시트 탭의 A2:D를 읽습니다.
    - A열: id (비어 있으면 `sheet-row-<행번호>`)
    - B열: title (비어 있으면 해당 행은 건너뜀)
    - C열: note
    - D열: 상태 — 값이 '완료'이면 목록에서 제외
    1행은 헤더용, 2행부터 데이터입니다.
    """
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 "
            "backend/.env 등에 설정하세요. "
            "(선택) GOOGLE_CHECKLIST_TAB 으로 체크리스트 탭 이름을 바꿀 수 있습니다(기본: 체크리스트)."
        )

    cred_path = Path(settings.google_service_account_file).expanduser()
    if not cred_path.is_file():
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 JSON 파일을 찾을 수 없습니다: {cred_path.resolve()}"
        )

    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)

    range_a1 = _checklist_read_range(settings.google_checklist_tab)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    items: list[ChecklistItem] = []
    for i, row in enumerate(rows):
        sheet_row = i + 2
        cells = list(row) + ["", "", "", ""]
        id_raw = str(cells[0]).strip() if cells[0] is not None else ""
        title = str(cells[1]).strip() if cells[1] is not None else ""
        note_raw = str(cells[2]).strip() if cells[2] is not None else ""

        if not title:
            continue

        if _row_status(cells) == _STATUS_DONE:
            continue

        item_id = id_raw if id_raw else f"sheet-row-{sheet_row}"
        note: str | None = note_raw if note_raw else None
        items.append(ChecklistItem(id=item_id, title=title, note=note))

    return items


def fetch_checklist_for_briefing(
    settings: Settings,
) -> tuple[list[tuple[ChecklistItem, int]], list[str]]:
    """
    브리핑 전용: 활성 체크리스트 행을 (항목, 시트 행번호)로 반환.
    제목 없는 비어 있지 않은 행은 경고 후 제외합니다.
    """
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 "
            "backend/.env 등에 설정하세요. "
            "(선택) GOOGLE_CHECKLIST_TAB 으로 체크리스트 탭 이름을 바꿀 수 있습니다(기본: 체크리스트)."
        )

    cred_path = Path(settings.google_service_account_file).expanduser()
    if not cred_path.is_file():
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 JSON 파일을 찾을 수 없습니다: {cred_path.resolve()}"
        )

    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)
    tab = settings.google_checklist_tab
    range_a1 = _checklist_read_range(tab)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)

    out: list[tuple[ChecklistItem, int]] = []
    warnings: list[str] = []
    for i, row in enumerate(rows):
        sheet_row = i + 2
        if _checklist_row_all_blank(row, 4):
            continue

        cells = list(row) + ["", "", "", ""]
        id_raw = str(cells[0]).strip() if cells[0] is not None else ""
        title = str(cells[1]).strip() if cells[1] is not None else ""
        note_raw = str(cells[2]).strip() if cells[2] is not None else ""

        if not title:
            continue

        if _row_status(cells) == _STATUS_DONE:
            continue

        item_id = id_raw if id_raw else f"sheet-row-{sheet_row}"
        note: str | None = note_raw if note_raw else None
        out.append((ChecklistItem(id=item_id, title=title, note=note), sheet_row))

    return out, warnings


def _build_id_to_sheet_row(settings: Settings) -> tuple[Path, str, dict[str, int]]:
    """title이 있는 모든 데이터 행에 대해 API id → 시트 행 번호."""
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
    range_a1 = _checklist_read_range(settings.google_checklist_tab)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)

    id_to_row: dict[str, int] = {}
    for i, row in enumerate(rows):
        sheet_row = i + 2
        cells = list(row) + ["", "", "", ""]
        title = str(cells[1]).strip() if cells[1] is not None else ""
        if not title:
            continue
        id_raw = str(cells[0]).strip() if cells[0] is not None else ""
        item_id = id_raw if id_raw else f"sheet-row-{sheet_row}"
        id_to_row[item_id] = sheet_row

    return cred_path, spreadsheet_id, id_to_row


def _build_id_to_sheet_row_active(settings: Settings) -> tuple[Path, str, dict[str, int]]:
    """GET /checklist 에 노출되는 행만 — 제목 있음, D열이 완료 아님."""
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
    range_a1 = _checklist_read_range(settings.google_checklist_tab)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)

    id_to_row: dict[str, int] = {}
    for i, row in enumerate(rows):
        sheet_row = i + 2
        cells = list(row) + ["", "", "", ""]
        title = str(cells[1]).strip() if cells[1] is not None else ""
        if not title:
            continue
        if _row_status(cells) == _STATUS_DONE:
            continue
        id_raw = str(cells[0]).strip() if cells[0] is not None else ""
        item_id = id_raw if id_raw else f"sheet-row-{sheet_row}"
        id_to_row[item_id] = sheet_row

    return cred_path, spreadsheet_id, id_to_row


def update_checklist_item_in_sheet(
    settings: Settings,
    item_id: str,
    title: str,
    note: str | None,
) -> None:
    """
    활성 행(미완료) 중 item_id에 해당하는 B·C열만 갱신합니다.
    note가 None이면 C열을 비웁니다.
    """
    oid = item_id.strip()
    if not oid:
        raise SheetsParseError("[파싱] id가 비어 있습니다.")

    cred_path, spreadsheet_id, id_to_row = _build_id_to_sheet_row_active(settings)
    if oid not in id_to_row:
        raise SheetsNotFoundError(
            f"[찾을수없음] 시트에 없거나 이미 완료된 id입니다: {oid}"
        )

    row_num = id_to_row[oid]
    tab_esc = settings.google_checklist_tab.replace("'", "''")
    c_text = "" if note is None else str(note).strip()
    data = [
        {"range": f"'{tab_esc}'!B{row_num}", "values": [[title]]},
        {"range": f"'{tab_esc}'!C{row_num}", "values": [[c_text]]},
    ]
    batch_update_sheet_values(cred_path, spreadsheet_id, data)


def complete_checklist_items_by_ids(settings: Settings, ids: list[str]) -> int:
    """
    요청 id에 해당하는 행의 D열을 '완료'로 설정합니다.
    id는 GET /checklist 와 동일한 규칙(빈 A열 → sheet-row-N)과 매칭됩니다.
    """
    if not ids:
        raise SheetsParseError("[파싱] 완료할 id가 없습니다.")

    cred_path, spreadsheet_id, id_to_row = _build_id_to_sheet_row(settings)

    missing = [i for i in ids if i not in id_to_row]
    if missing:
        shown = missing[:15]
        suffix = " …" if len(missing) > len(shown) else ""
        raise SheetsNotFoundError(
            "[찾을수없음] 시트에 없는 id: " + ", ".join(shown) + suffix
        )

    tab_esc = settings.google_checklist_tab.replace("'", "''")
    data = [
        {
            "range": f"'{tab_esc}'!D{id_to_row[lid]}",
            "values": [[_STATUS_DONE]],
        }
        for lid in ids
    ]
    batch_update_sheet_values(cred_path, spreadsheet_id, data)
    return len(ids)


def create_checklist_item_in_sheet(
    settings: Settings,
    title: str,
    note: str | None,
) -> ChecklistItem:
    """
    체크리스트 탭 맨 아래에 행 1개를 추가합니다.
    A=id(UUID), B=title, C=note(없으면 빈 칸), D=빈 칸(미완료).
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
    new_id = str(uuid.uuid4())
    c_cell = "" if note is None else str(note).strip()

    tab_esc = settings.google_checklist_tab.replace("'", "''")
    range_a1 = f"'{tab_esc}'!A:D"
    append_rows_to_sheet_range(
        cred_path,
        spreadsheet_id,
        range_a1,
        [[new_id, t, c_cell, ""]],
    )

    note_out: str | None = c_cell if c_cell else None
    return ChecklistItem(id=new_id, title=t, note=note_out)


def delete_checklist_row_by_id(settings: Settings, item_id: str) -> None:
    """
    GET /checklist 에 노출되는 활성 행(미완료) 중 item_id에 해당하는 행을 통째로 삭제합니다.
    """
    oid = item_id.strip()
    if not oid:
        raise SheetsParseError("[파싱] id가 비어 있습니다.")

    cred_path, spreadsheet_id, id_to_row = _build_id_to_sheet_row_active(settings)
    if oid not in id_to_row:
        raise SheetsNotFoundError(
            f"[찾을수없음] 목록에 없거나 이미 완료된 id입니다: {oid}"
        )

    sheet_row = id_to_row[oid]
    worksheet_id = get_worksheet_id_by_title(
        cred_path, spreadsheet_id, settings.google_checklist_tab
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
