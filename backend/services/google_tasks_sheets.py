"""Google Sheets '업무정리' 탭 — 조회·추가·수정·삭제."""

from __future__ import annotations

from pathlib import Path

from config import Settings
from .google_sheets import (
    append_rows_to_sheet_range,
    batch_update_sheet_values,
    get_worksheet_id_by_title,
    read_sheet_tab_values,
    spreadsheet_id_from_url,
    spreadsheets_batch_update,
)
from .sheet_cell_utils import padded_row_cells
from .sheets_errors import (
    SheetsConfigurationError,
    SheetsNotFoundError,
    SheetsParseError,
)

# 업무정리 탭 열 매핑:
# A=완료, B=마감일, C=관련플랫폼, D=분류, E=우선순위, F=업무명,
# G=정량화, H=난이도, I=피로도, J=상태, K=담당자/요청주체, L=관련작품, M=메모
_COLS = 13
_IDX = dict(완료=0, 마감일=1, 관련플랫폼=2, 분류=3, 우선순위=4, 업무명=5,
            정량화=6, 난이도=7, 피로도=8, 상태=9, 담당자=10, 관련작품=11, 메모=12)


def _tab_esc(tab: str) -> str:
    return tab.replace("'", "''")


def _ctx(settings: Settings) -> tuple[Path, str, str]:
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 설정하세요."
        )
    cred = Path(settings.google_service_account_file).expanduser()
    if not cred.is_file():
        raise SheetsConfigurationError(f"[설정] 서비스 계정 파일 없음: {cred}")
    sid = spreadsheet_id_from_url(settings.google_sheet_url)
    tab = getattr(settings, "google_tasks_tab", "업무정리")
    return cred, sid, tab


def _c(cells: list[str], key: str) -> str:
    return cells[_IDX[key]] if _IDX[key] < len(cells) else ""


def _row_id(sheet_row: int) -> str:
    return f"task-row-{sheet_row}"


def fetch_tasks(settings: Settings) -> list[dict]:
    cred, sid, tab = _ctx(settings)
    esc = _tab_esc(tab)
    rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A2:M")
    out = []
    for i, row in enumerate(rows):
        cells = padded_row_cells(row if isinstance(row, list) else [], _COLS)
        title = _c(cells, "업무명").strip()
        if not title:
            continue
        out.append({
            "id": _row_id(i + 2),
            "sheet_row": i + 2,
            "완료": _c(cells, "완료"),
            "마감일": _c(cells, "마감일"),
            "관련플랫폼": _c(cells, "관련플랫폼"),
            "분류": _c(cells, "분류"),
            "우선순위": _c(cells, "우선순위"),
            "업무명": title,
            "정량화": _c(cells, "정량화"),
            "난이도": _c(cells, "난이도"),
            "피로도": _c(cells, "피로도"),
            "상태": _c(cells, "상태"),
            "담당자": _c(cells, "담당자"),
            "관련작품": _c(cells, "관련작품"),
            "메모": _c(cells, "메모"),
        })
    return out


def create_task(settings: Settings, fields: dict) -> dict:
    cred, sid, tab = _ctx(settings)
    title = str(fields.get("업무명", "")).strip()
    if not title:
        raise SheetsParseError("[파싱] 업무명은 비울 수 없습니다.")
    row = [""] * _COLS
    row[_IDX["업무명"]] = title
    for key in ("마감일", "관련플랫폼", "분류", "우선순위", "정량화", "난이도", "피로도", "상태", "담당자", "관련작품", "메모"):
        val = str(fields.get(key, "")).strip()
        if val:
            row[_IDX[key]] = val
    esc = _tab_esc(tab)
    import re
    updated = append_rows_to_sheet_range(cred, sid, f"'{esc}'!A:M", [row])
    m = re.search(r"!([A-Za-z]+)(\d+)", updated or "")
    sheet_row = int(m.group(2)) if m else 0
    return {
        "id": _row_id(sheet_row), "sheet_row": sheet_row, "업무명": title,
        **{k: str(fields.get(k, "")) for k in ("마감일", "관련플랫폼", "분류", "우선순위", "정량화", "난이도", "피로도", "상태", "담당자", "관련작품", "메모")}
    }


def _find_row(settings: Settings) -> tuple[Path, str, str, dict[str, int]]:
    cred, sid, tab = _ctx(settings)
    esc = _tab_esc(tab)
    rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A2:M")
    id_to_row: dict[str, int] = {}
    for i, row in enumerate(rows):
        cells = padded_row_cells(row if isinstance(row, list) else [], _COLS)
        if _c(cells, "업무명").strip():
            id_to_row[_row_id(i + 2)] = i + 2
    return cred, sid, tab, id_to_row


def update_task(settings: Settings, task_id: str, fields: dict) -> None:
    cred, sid, tab, id_to_row = _find_row(settings)
    if task_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {task_id}")
    row_num = id_to_row[task_id]
    esc = _tab_esc(tab)
    col_map = {
        "완료": "A", "마감일": "B", "관련플랫폼": "C", "분류": "D", "우선순위": "E",
        "업무명": "F", "정량화": "G", "난이도": "H", "피로도": "I",
        "상태": "J", "담당자": "K", "관련작품": "L", "메모": "M",
    }
    data = []
    for key, col in col_map.items():
        if key in fields:
            data.append({"range": f"'{esc}'!{col}{row_num}", "values": [[str(fields[key])]]})
    if data:
        batch_update_sheet_values(cred, sid, data)


def delete_task(settings: Settings, task_id: str) -> None:
    cred, sid, tab, id_to_row = _find_row(settings)
    if task_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {task_id}")
    sheet_row = id_to_row[task_id]
    worksheet_id = get_worksheet_id_by_title(cred, sid, tab)
    spreadsheets_batch_update(cred, sid, [{
        "deleteDimension": {"range": {
            "sheetId": worksheet_id, "dimension": "ROWS",
            "startIndex": sheet_row - 1, "endIndex": sheet_row,
        }}
    }])
