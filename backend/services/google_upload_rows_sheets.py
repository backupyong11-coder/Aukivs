"""Google Sheets '업로드정리' 탭 — 전체 열 조회·핵심 필드 수정."""

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

# A=완료, B=업로드일, C=플랫폼명, D=작품명, E=업로드완료여부,
# F=업로드주기, G=업로드요일, H=업로드방식, I=런칭일,
# J=마지막업로드일, K=다음업로드일, L=다음업로드회수,
# M=원고준비, N=(빈), O=업로드링크/제출처, P=마지막업로드회수, Q=비고
_COLS = 17
_IDX = dict(완료=0, 업로드일=1, 플랫폼명=2, 작품명=3, 업로드완료여부=4,
            업로드주기=5, 업로드요일=6, 업로드방식=7, 런칭일=8,
            마지막업로드일=9, 다음업로드일=10, 다음업로드회수=11,
            원고준비=12, 업로드링크=14, 마지막업로드회수=15, 비고=16)
_COL_LETTER = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q"]


def _tab_esc(tab: str) -> str:
    return tab.replace("'", "''")


def _ctx(settings: Settings) -> tuple[Path, str, str]:
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError("[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 설정하세요.")
    cred = Path(settings.google_service_account_file).expanduser()
    if not cred.is_file():
        raise SheetsConfigurationError(f"[설정] 서비스 계정 파일 없음: {cred}")
    sid = spreadsheet_id_from_url(settings.google_sheet_url)
    tab = getattr(settings, "google_uploads_tab", "업로드정리")
    return cred, sid, tab


def _c(cells: list[str], key: str) -> str:
    idx = _IDX.get(key, -1)
    return cells[idx] if 0 <= idx < len(cells) else ""


def _row_id(sheet_row: int) -> str:
    return f"upload-row-{sheet_row}"


def fetch_upload_rows(settings: Settings) -> list[dict]:
    cred, sid, tab = _ctx(settings)
    esc = _tab_esc(tab)
    rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A2:Q")
    out = []
    for i, row in enumerate(rows):
        cells = padded_row_cells(row if isinstance(row, list) else [], _COLS)
        작품명 = _c(cells, "작품명").strip()
        if not 작품명:
            continue
        out.append({
            "id": _row_id(i + 2),
            "sheet_row": i + 2,
            "완료": _c(cells, "완료"),
            "업로드일": _c(cells, "업로드일"),
            "플랫폼명": _c(cells, "플랫폼명"),
            "작품명": 작품명,
            "업로드완료여부": _c(cells, "업로드완료여부"),
            "업로드주기": _c(cells, "업로드주기"),
            "업로드요일": _c(cells, "업로드요일"),
            "업로드방식": _c(cells, "업로드방식"),
            "런칭일": _c(cells, "런칭일"),
            "마지막업로드일": _c(cells, "마지막업로드일"),
            "다음업로드일": _c(cells, "다음업로드일"),
            "다음업로드회수": _c(cells, "다음업로드회수"),
            "원고준비": _c(cells, "원고준비"),
            "업로드링크": _c(cells, "업로드링크"),
            "마지막업로드회수": _c(cells, "마지막업로드회수"),
            "비고": _c(cells, "비고"),
        })
    return out


def _find_row(settings: Settings) -> tuple[Path, str, str, dict[str, int]]:
    cred, sid, tab = _ctx(settings)
    esc = _tab_esc(tab)
    rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A2:Q")
    id_to_row: dict[str, int] = {}
    for i, row in enumerate(rows):
        cells = padded_row_cells(row if isinstance(row, list) else [], _COLS)
        if _c(cells, "작품명").strip():
            id_to_row[_row_id(i + 2)] = i + 2
    return cred, sid, tab, id_to_row


def create_upload_row(settings: Settings, fields: dict) -> dict:
    cred, sid, tab = _ctx(settings)
    작품명 = str(fields.get("작품명", "")).strip()
    if not 작품명:
        raise SheetsParseError("[파싱] 작품명은 비울 수 없습니다.")
    row = [""] * _COLS
    key_to_idx = {k: v for k, v in _IDX.items()}
    for key, idx in key_to_idx.items():
        val = str(fields.get(key, "")).strip()
        if val:
            row[idx] = val
    esc = _tab_esc(tab)
    import re
    updated = append_rows_to_sheet_range(cred, sid, f"'{esc}'!A:Q", [row])
    m = re.search(r"!([A-Za-z]+)(\d+)", updated or "")
    sheet_row = int(m.group(2)) if m else 0
    return {"id": _row_id(sheet_row), "sheet_row": sheet_row, "작품명": 작품명,
            **{k: str(fields.get(k, "")) for k in _IDX if k != "작품명"}}


# 수정 가능 필드: 완료,업로드일,플랫폼명,작품명,업로드방식,비고 + 전체
_EDITABLE_COL_MAP = {
    "완료": "A", "업로드일": "B", "플랫폼명": "C", "작품명": "D",
    "업로드완료여부": "E", "업로드주기": "F", "업로드요일": "G",
    "업로드방식": "H", "런칭일": "I", "마지막업로드일": "J",
    "다음업로드일": "K", "다음업로드회수": "L", "원고준비": "M",
    "업로드링크": "O", "마지막업로드회수": "P", "비고": "Q",
}


def update_upload_row(settings: Settings, row_id: str, fields: dict) -> None:
    cred, sid, tab, id_to_row = _find_row(settings)
    if row_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {row_id}")
    row_num = id_to_row[row_id]
    esc = _tab_esc(tab)
    data = []
    for key, col in _EDITABLE_COL_MAP.items():
        if key in fields:
            data.append({"range": f"'{esc}'!{col}{row_num}", "values": [[str(fields[key])]]})
    if data:
        batch_update_sheet_values(cred, sid, data)


def delete_upload_row(settings: Settings, row_id: str) -> None:
    cred, sid, tab, id_to_row = _find_row(settings)
    if row_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {row_id}")
    sheet_row = id_to_row[row_id]
    worksheet_id = get_worksheet_id_by_title(cred, sid, tab)
    spreadsheets_batch_update(cred, sid, [{
        "deleteDimension": {"range": {
            "sheetId": worksheet_id, "dimension": "ROWS",
            "startIndex": sheet_row - 1, "endIndex": sheet_row,
        }}
    }])
