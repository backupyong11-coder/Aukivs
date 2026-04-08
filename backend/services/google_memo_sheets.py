"""Google Sheets 「메모장」 탭: 메모 행 추가·조회. 헤더(1행)로 열 위치를 찾습니다."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from config import Settings
from schemas import MemoItem
from .google_sheets import (
    append_rows_to_sheet_range,
    read_sheet_tab_values,
    spreadsheet_id_from_url,
)
from .sheet_cell_utils import cell_str
from .sheets_errors import SheetsConfigurationError, SheetsParseError

_KST = ZoneInfo("Asia/Seoul")

_HEADER_CONTENT = "메모내용"
_HEADER_DATE = "메모날짜"
_HEADER_CATEGORY = "메모분류"
_HEADER_CATEGORY_ALT = "분류"


def _memo_tab_esc(tab: str) -> str:
    return tab.replace("'", "''")


def _col_letter(zero_based_last: int) -> str:
    """0-based inclusive last column index → A1 column letters (e.g. 2 → C)."""
    n = zero_based_last + 1
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _parse_header_row(row: list[object] | None) -> tuple[int, int, int]:
    if not row:
        raise SheetsParseError(
            f"[파싱] 메모 탭 1행에 헤더가 없습니다. "
            f"1행에 {_HEADER_CONTENT}, {_HEADER_DATE}, {_HEADER_CATEGORY}(또는 {_HEADER_CATEGORY_ALT}) 열 제목을 넣어주세요."
        )
    col_c: int | None = None
    col_d: int | None = None
    col_cat: int | None = None
    for i, cell in enumerate(row):
        name = cell_str(cell)
        if name == _HEADER_CONTENT:
            col_c = i
        elif name == _HEADER_DATE:
            col_d = i
        elif name == _HEADER_CATEGORY or name == _HEADER_CATEGORY_ALT:
            col_cat = i
    missing = []
    if col_c is None:
        missing.append(_HEADER_CONTENT)
    if col_d is None:
        missing.append(_HEADER_DATE)
    if col_cat is None:
        missing.append(f"{_HEADER_CATEGORY} 또는 {_HEADER_CATEGORY_ALT}")
    if missing:
        raise SheetsParseError(
            "[파싱] 메모 탭 1행에서 다음 헤더를 찾지 못했습니다: "
            + ", ".join(missing)
            + f". (필요: {_HEADER_CONTENT}, {_HEADER_DATE}, {_HEADER_CATEGORY}·{_HEADER_CATEGORY_ALT} 중 하나)"
        )
    return col_c, col_d, col_cat


def _cell(row: list[object], idx: int) -> str:
    if idx < len(row) and row[idx] is not None:
        return str(row[idx]).strip()
    return ""


def _now_memo_timestamp_seoul() -> str:
    """시트 메모날짜 열: 년-월-일 시:분:초 (서울)."""
    return datetime.now(_KST).strftime("%Y-%m-%d %H:%M:%S")


def _memo_sheet_context(settings: Settings) -> tuple[Path, str, str]:
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 "
            "backend/.env 등에 설정하세요. "
            f"(선택) GOOGLE_MEMO_TAB 으로 메모 탭 이름을 바꿀 수 있습니다(기본: 메모장)."
        )
    cred_path = Path(settings.google_service_account_file).expanduser()
    if not cred_path.is_file():
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 파일을 찾을 수 없습니다: {cred_path}"
        )
    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)
    tab = settings.google_memo_tab
    return cred_path, spreadsheet_id, tab


def fetch_memos_from_google_sheets(settings: Settings) -> list[MemoItem]:
    cred_path, spreadsheet_id, tab = _memo_sheet_context(settings)
    tab_esc = _memo_tab_esc(tab)
    range_a1 = f"'{tab_esc}'!A:Z"
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    if not rows:
        return []
    col_c, col_d, col_cat = _parse_header_row(rows[0])
    out: list[MemoItem] = []
    for ri, row in enumerate(rows[1:], start=2):
        if not isinstance(row, list):
            continue
        content = _cell(row, col_c)
        if not content:
            continue
        memo_date = _cell(row, col_d)
        cat_raw = _cell(row, col_cat)
        category = cat_raw if cat_raw else None
        out.append(
            MemoItem(
                sheet_row=ri,
                content=content,
                memo_date=memo_date,
                category=category,
            )
        )
    out.sort(key=lambda m: m.sheet_row, reverse=True)
    return out


def append_memo_row_to_google_sheets(
    settings: Settings,
    content: str,
    category: str | None,
) -> None:
    text = content.strip()
    if not text:
        raise SheetsParseError("[파싱] 메모 내용이 비어 있습니다.")

    cred_path, spreadsheet_id, tab = _memo_sheet_context(settings)
    tab_esc = _memo_tab_esc(tab)
    header_rows = read_sheet_tab_values(
        cred_path, spreadsheet_id, f"'{tab_esc}'!1:1"
    )
    header = header_rows[0] if header_rows else []
    col_c, col_d, col_cat = _parse_header_row(header)

    ts = _now_memo_timestamp_seoul()
    cat_cell = (category or "").strip()

    last_idx = max(col_c, col_d, col_cat)
    new_row = [""] * (last_idx + 1)
    new_row[col_c] = text
    new_row[col_d] = ts
    new_row[col_cat] = cat_cell

    end_letter = _col_letter(last_idx)
    append_rows_to_sheet_range(
        cred_path,
        spreadsheet_id,
        f"'{tab_esc}'!A:{end_letter}",
        [new_row],
    )
