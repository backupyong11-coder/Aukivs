"""Google Sheets '플랫폼정리' 탭 — 조회·핵심 필드 수정 (마지막업데이트날짜 자동)."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from config import Settings
from .google_sheets import (
    batch_update_sheet_values,
    read_sheet_tab_values,
    spreadsheet_id_from_url,
)
from .sheet_cell_utils import padded_row_cells
from .sheets_errors import (
    SheetsConfigurationError,
    SheetsNotFoundError,
)

_SEOUL = ZoneInfo("Asia/Seoul")

# 현재 플랫폼정리 열 구조:
# A=회사명, B=발표일, C=지원사업, D=성인웹툰(구 일반계약), E=불가, F=예정, G=진행중, H=완료,
# I=계약, J=미팅, K=현재단계, L=마지막업데이트날짜(자동), M=마지막상황,
# N=대기사유, O=다음액션, P=플랫폼명, Q=우선순위,
# R=담당자명, S=담당자이메일, T=연락수단/연락처, ...AD=비고

_COLS = 32  # 넉넉하게

_EDITABLE_COL_MAP = {
    "현재단계": "K",
    "마지막업데이트날짜": "L",
    "마지막상황": "M",
    "대기사유": "N",
    "다음액션": "O",
    "우선순위": "Q",
    "비고": "AD",
}

_READ_RANGE_END = "AD"


def _tab_esc(tab: str) -> str:
    return tab.replace("'", "''")


def _ctx(settings: Settings) -> tuple[Path, str, str]:
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError("[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 설정하세요.")
    cred = Path(settings.google_service_account_file).expanduser()
    if not cred.is_file():
        raise SheetsConfigurationError(f"[설정] 서비스 계정 파일 없음: {cred}")
    sid = spreadsheet_id_from_url(settings.google_sheet_url)
    tab = getattr(settings, "google_platform_tab", "플랫폼정리")
    return cred, sid, tab


def _now_seoul_str() -> str:
    return datetime.now(_SEOUL).strftime("%Y-%m-%d %H:%M:%S")


def _row_id(sheet_row: int) -> str:
    return f"platform-row-{sheet_row}"


def fetch_platforms(settings: Settings) -> list[dict]:
    cred, sid, tab = _ctx(settings)
    esc = _tab_esc(tab)
    # 1행 헤더, 2행부터 데이터
    all_rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A1:{_READ_RANGE_END}")
    if not all_rows:
        return []
    header = [str(c).strip() if c else "" for c in all_rows[0]]
    out = []
    for i, row in enumerate(all_rows[1:], start=2):
        cells = list(row) + [""] * max(0, len(header) - len(row))
        rec: dict = {"id": _row_id(i), "sheet_row": i}
        for j, h in enumerate(header):
            rec[h if h else f"_col_{j+1}"] = str(cells[j]).strip() if j < len(cells) and cells[j] else ""
        company = rec.get("회사명", "").strip()
        if not company:
            continue
        out.append(rec)
    return out


def _find_row(settings: Settings) -> tuple[Path, str, str, dict[str, int]]:
    cred, sid, tab = _ctx(settings)
    esc = _tab_esc(tab)
    all_rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A1:{_READ_RANGE_END}")
    if not all_rows:
        return cred, sid, tab, {}
    id_to_row: dict[str, int] = {}
    for i, row in enumerate(all_rows[1:], start=2):
        cells = padded_row_cells(row if isinstance(row, list) else [], _COLS)
        if cells[0].strip():
            id_to_row[_row_id(i)] = i
    return cred, sid, tab, id_to_row


def update_platform(settings: Settings, platform_id: str, fields: dict) -> None:
    """핵심 필드 수정 + L열(마지막업데이트날짜) 자동 기록."""
    cred, sid, tab, id_to_row = _find_row(settings)
    if platform_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {platform_id}")
    row_num = id_to_row[platform_id]
    esc = _tab_esc(tab)

    data = []
    for key, col in _EDITABLE_COL_MAP.items():
        if key == "마지막업데이트날짜":
            continue  # 자동 처리
        if key in fields:
            data.append({"range": f"'{esc}'!{col}{row_num}", "values": [[str(fields[key])]]})

    # 마지막업데이트날짜 L열 자동 갱신
    data.append({"range": f"'{esc}'!L{row_num}", "values": [[_now_seoul_str()]]})

    if data:
        batch_update_sheet_values(cred, sid, data)
