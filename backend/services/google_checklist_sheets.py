"""Google Sheets '체크리스트' 탭 읽기·완료 처리 (서비스 계정)."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from config import Settings
from schemas import ChecklistItem

from .google_tasks_sheets import (
    _col_index_to_a1_letters_zero_based,
    read_tasks_header_column_map,
)
from .sheet_cell_utils import padded_row_cells
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

logger = logging.getLogger(__name__)

_STATUS_DONE = "완료"
_CHECKLIST_COLS = 11  # A2:K (완료, 마감, 플랫폼, 분류, 업무명, 작품, 빈칸, 상태, …)

# --- 구버전: 업무정리 고정 인덱스( google_tasks_sheets.read_tasks_header_column_map 으로 대체) ---
# # GOOGLE_CHECKLIST_TAB 이 GOOGLE_TASKS_TAB 과 같을 때(예: 둘 다 "업무정리"):
# # google_tasks_sheets 와 동일한 열 — A~U (업무명=H, 완료=C, 관련플랫폼=M)
# _TASK_COLS = 21
# _TASK_IDX: dict[str, int] = {
#     "날짜그룹": 0,
#     "우선순위": 1,
#     "완료": 2,
#     "마감일": 3,
#     "분야": 4,
#     "분류": 5,
#     "정량화 분": 6,
#     "업무명": 7,
#     "정량화": 8,
#     "정량화 구분": 9,
#     "시간": 10,
#     "시간변환": 11,
#     "관련플랫폼": 12,
#     "세부수치": 13,
#     "세부단위": 14,
#     "관련작품": 15,
#     "난이도": 16,
#     "피로도": 17,
#     "상태": 18,
#     "담당자": 19,
#     "메모": 20,
# }


def _uses_tasks_layout(settings: Settings) -> bool:
    """체크리스트가 업무정리 열 구조(A~U, H=업무명)를 쓰는 경우."""
    ct = settings.google_checklist_tab.strip()
    if ct == settings.google_tasks_tab.strip():
        return True
    # GOOGLE_TASKS_TAB 이름만 다르게 둔 경우에도 탭명이 업무정리면 동일 레이아웃
    return ct == "업무정리"


def _data_range_a2(settings: Settings) -> str:
    escaped = settings.google_checklist_tab.replace("'", "''")
    # 레거시 체크리스트(A2:K)만 사용. 업무정리 레이아웃은 read_tasks_header_column_map 으로 A1:ZZ 읽음.
    return f"'{escaped}'!A2:K"


def _row_width(settings: Settings) -> int:
    # 업무정리 레이아웃은 호출부에서 헤더 width 사용. 여기서는 레거시 열만.
    return _CHECKLIST_COLS


def _task_cell_str(cells: list[str], key: str, col_map: dict[str, int]) -> str:
    # 구버전: i = _TASK_IDX[key]; return cells[i] if i < len(cells) else ""
    idx = col_map.get(key)
    if idx is None:
        return ""
    if idx >= len(cells):
        return ""
    return cells[idx]


def _optional_nonempty(s: str) -> str | None:
    t = s.strip()
    return t if t else None


def _sheet_cell_truthy_done(raw: str) -> bool:
    return raw.strip().upper() in ("TRUE", "1", "YES", "Y")


def _task_row_active_item(
    cells: list[str], sheet_row: int, col_map: dict[str, int]
) -> ChecklistItem | None:
    title = _task_cell_str(cells, "업무명", col_map).strip()
    if not title:
        return None
    if _sheet_cell_truthy_done(_task_cell_str(cells, "완료", col_map)):
        return None
    return ChecklistItem(
        id=_sheet_row_id(sheet_row),
        title=title,
        note=None,
        due_date=_optional_nonempty(_task_cell_str(cells, "마감일", col_map)),
        platform=_optional_nonempty(_task_cell_str(cells, "관련플랫폼", col_map)),
        category=_optional_nonempty(_task_cell_str(cells, "분류", col_map)),
        priority=_optional_nonempty(_task_cell_str(cells, "우선순위", col_map)),
        quantification=_optional_nonempty(_task_cell_str(cells, "정량화", col_map)),
        difficulty=_optional_nonempty(_task_cell_str(cells, "난이도", col_map)),
        fatigue=_optional_nonempty(_task_cell_str(cells, "피로도", col_map)),
        work_status=_optional_nonempty(_task_cell_str(cells, "상태", col_map)),
        memo=_optional_nonempty(_task_cell_str(cells, "메모", col_map)),
    )


def _checklist_row_all_blank(row: list[object], width: int) -> bool:
    padded = list(row) + [""] * width
    for i in range(width):
        cell = padded[i]
        if str(cell if cell is not None else "").strip():
            return False
    return True


def _pad_checklist_cells(row: list[object]) -> list[str]:
    out: list[str] = []
    for c in row:
        out.append(str(c) if c is not None else "")
    while len(out) < _CHECKLIST_COLS:
        out.append("")
    return out[:_CHECKLIST_COLS]


def _title_cell(cells: list[str]) -> str:
    return cells[4].strip() if len(cells) > 4 else ""


def _due_cell(cells: list[str]) -> str | None:
    raw = cells[1].strip() if len(cells) > 1 else ""
    return raw if raw else None


def _platform_cell(cells: list[str]) -> str | None:
    raw = cells[2].strip() if len(cells) > 2 else ""
    return raw if raw else None


def _category_cell(cells: list[str]) -> str | None:
    raw = cells[3].strip() if len(cells) > 3 else ""
    return raw if raw else None


def _row_status_f(cells: list[str]) -> str:
    if len(cells) < _CHECKLIST_COLS:
        return ""
    return cells[7].strip()


def _sheet_row_id(sheet_row: int) -> str:
    return f"sheet-row-{sheet_row}"


def _parse_sheet_row_from_append_updated_range(updated_range: str | None) -> int:
    if not updated_range:
        raise SheetsParseError("[파싱] 행 추가 응답에 updatedRange가 없습니다.")
    m = re.search(r"!([A-Za-z]+)(\d+)", updated_range)
    if not m:
        raise SheetsParseError(
            f"[파싱] append 범위에서 시작 행을 해석할 수 없습니다: {updated_range!r}"
        )
    return int(m.group(2))


def fetch_checklist_from_google_sheets(settings: Settings) -> list[ChecklistItem]:
    """
    레거시 체크리스트 탭: A2:K, E=업무명, H=상태 '완료' 제외.
    업무정리 탭과 동일 이름으로 연동 시: A2:U, H=업무명, C열 완료 체크 제외.
    id는 항상 sheet-row-<행번호>, note는 응답에서 항상 None.
    """
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 "
            "backend/.env 등에 설정하세요. "
            "(선택) GOOGLE_CHECKLIST_TAB 으로 탭 이름을 바꿀 수 있습니다. "
            "미설정 시 GOOGLE_TASKS_TAB(기본 업무정리)과 동일합니다."
        )

    cred_path = Path(settings.google_service_account_file).expanduser()
    if not cred_path.is_file():
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 JSON 파일을 찾을 수 없습니다: {cred_path.resolve()}"
        )

    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)

    items: list[ChecklistItem] = []
    if _uses_tasks_layout(settings):
        col_map, width, _, data_rows = read_tasks_header_column_map(
            cred_path, spreadsheet_id, settings.google_checklist_tab
        )
        for i, row in enumerate(data_rows):
            sheet_row = i + 2
            cells = padded_row_cells(
                list(row) if isinstance(row, list) else [], width
            )
            it = _task_row_active_item(cells, sheet_row, col_map)
            if it:
                items.append(it)
        return items

    range_a1 = _data_range_a2(settings)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    for i, row in enumerate(rows):
        sheet_row = i + 2
        cells = _pad_checklist_cells(list(row))
        title = _title_cell(cells)

        if not title:
            continue

        if _row_status_f(cells) == _STATUS_DONE:
            continue

        item_id = _sheet_row_id(sheet_row)
        due = _due_cell(cells)
        platform = _platform_cell(cells)
        category = _category_cell(cells)
        items.append(
            ChecklistItem(
                id=item_id,
                title=title,
                note=None,
                due_date=due,
                platform=platform,
                category=category,
            ),
        )

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
            "(선택) GOOGLE_CHECKLIST_TAB 으로 탭 이름을 바꿀 수 있습니다. "
            "미설정 시 GOOGLE_TASKS_TAB(기본 업무정리)과 동일합니다."
        )

    cred_path = Path(settings.google_service_account_file).expanduser()
    if not cred_path.is_file():
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 JSON 파일을 찾을 수 없습니다: {cred_path.resolve()}"
        )

    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)

    out: list[tuple[ChecklistItem, int]] = []
    warnings: list[str] = []
    if _uses_tasks_layout(settings):
        col_map, width, _, data_rows = read_tasks_header_column_map(
            cred_path, spreadsheet_id, settings.google_checklist_tab
        )
        rw = width
        for i, row in enumerate(data_rows):
            sheet_row = i + 2
            if _checklist_row_all_blank(row, rw):
                continue
            cells = padded_row_cells(
                list(row) if isinstance(row, list) else [], width
            )
            it = _task_row_active_item(cells, sheet_row, col_map)
            if it:
                out.append((it, sheet_row))
        return out, warnings

    range_a1 = _data_range_a2(settings)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    rw = _row_width(settings)
    for i, row in enumerate(rows):
        sheet_row = i + 2
        if _checklist_row_all_blank(row, rw):
            continue

        cells = _pad_checklist_cells(list(row))
        title = _title_cell(cells)

        if not title:
            continue

        if _row_status_f(cells) == _STATUS_DONE:
            continue

        item_id = _sheet_row_id(sheet_row)
        due = _due_cell(cells)
        platform = _platform_cell(cells)
        category = _category_cell(cells)
        out.append(
            (
                ChecklistItem(
                    id=item_id,
                    title=title,
                    note=None,
                    due_date=due,
                    platform=platform,
                    category=category,
                ),
                sheet_row,
            ),
        )

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

    id_to_row: dict[str, int] = {}
    if _uses_tasks_layout(settings):
        col_map, width, _, data_rows = read_tasks_header_column_map(
            cred_path, spreadsheet_id, settings.google_checklist_tab
        )
        for i, row in enumerate(data_rows):
            sheet_row = i + 2
            cells = padded_row_cells(
                list(row) if isinstance(row, list) else [], width
            )
            title = _task_cell_str(cells, "업무명", col_map).strip()
            if not title:
                continue
            item_id = _sheet_row_id(sheet_row)
            id_to_row[item_id] = sheet_row
        return cred_path, spreadsheet_id, id_to_row

    range_a1 = _data_range_a2(settings)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    for i, row in enumerate(rows):
        sheet_row = i + 2
        cells = _pad_checklist_cells(list(row))
        title = _title_cell(cells)
        if not title:
            continue
        item_id = _sheet_row_id(sheet_row)
        id_to_row[item_id] = sheet_row

    return cred_path, spreadsheet_id, id_to_row


def _build_id_to_sheet_row_active(settings: Settings) -> tuple[Path, str, dict[str, int]]:
    """GET /checklist 에 노출되는 행만 — 레거시: 제목 있음·H≠완료 / 업무정리: 제목 있음·C 미체크."""
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

    id_to_row: dict[str, int] = {}
    if _uses_tasks_layout(settings):
        col_map, width, _, data_rows = read_tasks_header_column_map(
            cred_path, spreadsheet_id, settings.google_checklist_tab
        )
        for i, row in enumerate(data_rows):
            sheet_row = i + 2
            cells = padded_row_cells(
                list(row) if isinstance(row, list) else [], width
            )
            title = _task_cell_str(cells, "업무명", col_map).strip()
            if not title:
                continue
            if _sheet_cell_truthy_done(_task_cell_str(cells, "완료", col_map)):
                continue
            item_id = _sheet_row_id(sheet_row)
            id_to_row[item_id] = sheet_row
        return cred_path, spreadsheet_id, id_to_row

    range_a1 = _data_range_a2(settings)
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    for i, row in enumerate(rows):
        sheet_row = i + 2
        cells = _pad_checklist_cells(list(row))
        title = _title_cell(cells)
        if not title:
            continue
        if _row_status_f(cells) == _STATUS_DONE:
            continue
        item_id = _sheet_row_id(sheet_row)
        id_to_row[item_id] = sheet_row

    return cred_path, spreadsheet_id, id_to_row


def update_checklist_item_in_sheet(
    settings: Settings,
    item_id: str,
    title: str,
    note: str | None,
) -> None:
    """
    활성 행(미완료) 중 item_id에 해당하는 업무명 열만 갱신합니다.
    레거시: E열 / 업무정리 연동: H열.
    note 인자는 API 호환용이며 시트 신규 열 구조에서는 사용하지 않습니다.
    """
    _ = note
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
    if _uses_tasks_layout(settings):
        col_map, _, _, _ = read_tasks_header_column_map(
            cred_path, spreadsheet_id, settings.google_checklist_tab
        )
        um = col_map.get("업무명")
        if um is None:
            logger.warning(
                "[체크리스트] 업무정리 레이아웃에서 '업무명' 헤더 열을 찾지 못했습니다.",
            )
            raise SheetsParseError("[파싱] 시트에 '업무명' 열 헤더가 없습니다.")
        col = _col_index_to_a1_letters_zero_based(um)
    else:
        col = "E"
    data = [{"range": f"'{tab_esc}'!{col}{row_num}", "values": [[title]]}]
    batch_update_sheet_values(cred_path, spreadsheet_id, data)


def complete_checklist_items_by_ids(settings: Settings, ids: list[str]) -> int:
    """
    레거시: H열(상태)을 '완료'로 설정.
    업무정리 연동: C열(완료 체크박스)을 TRUE 로 설정.
    id는 GET /checklist 와 동일한 규칙(sheet-row-N)과 매칭됩니다.
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
    if _uses_tasks_layout(settings):
        col_map, _, _, _ = read_tasks_header_column_map(
            cred_path, spreadsheet_id, settings.google_checklist_tab
        )
        wdone = col_map.get("완료")
        if wdone is None:
            logger.warning(
                "[체크리스트] 업무정리 레이아웃에서 '완료' 헤더 열을 찾지 못했습니다.",
            )
            raise SheetsParseError("[파싱] 시트에 '완료' 열 헤더가 없습니다.")
        col_letter = _col_index_to_a1_letters_zero_based(wdone)
        data = [
            {
                "range": f"'{tab_esc}'!{col_letter}{id_to_row[lid]}",
                "values": [["TRUE"]],
            }
            for lid in ids
        ]
    else:
        data = [
            {
                "range": f"'{tab_esc}'!H{id_to_row[lid]}",
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
    레거시: E=업무명, A2:K.
    업무정리 연동: H=업무명, A2:U.
    id는 sheet-row-<추가된 행>.
    """
    _ = note
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

    tab_esc = settings.google_checklist_tab.replace("'", "''")
    if _uses_tasks_layout(settings):
        col_map, width, _, _ = read_tasks_header_column_map(
            cred_path, spreadsheet_id, settings.google_checklist_tab
        )
        um = col_map.get("업무명")
        if um is None:
            logger.warning(
                "[체크리스트] 업무정리 레이아웃에서 '업무명' 헤더 열을 찾지 못했습니다.",
            )
            raise SheetsParseError("[파싱] 시트에 '업무명' 열 헤더가 없습니다.")
        row = [""] * width
        row[um] = t
        end_letter = _col_index_to_a1_letters_zero_based(width - 1)
        range_a1 = f"'{tab_esc}'!A:{end_letter}"
        updated_range = append_rows_to_sheet_range(
            cred_path,
            spreadsheet_id,
            range_a1,
            [row],
        )
    else:
        range_a1 = f"'{tab_esc}'!A:K"
        updated_range = append_rows_to_sheet_range(
            cred_path,
            spreadsheet_id,
            range_a1,
            [["", "", "", "", t, "", "", "", "", "", ""]],
        )
    sheet_row = _parse_sheet_row_from_append_updated_range(updated_range)
    new_id = _sheet_row_id(sheet_row)
    return ChecklistItem(id=new_id, title=t, note=None, due_date=None)


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
