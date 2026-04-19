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

# 현재 플랫폼정리 열 구조 (A~AO):
# A=회사명, B=분류, C=발표일, D=지원사업, E=일반계약, F=불가, G=예정, H=진행중, I=완료,
# J=계약, K=미팅, L=현재단계, M=마지막업데이트날짜(자동), N=마지막 상황,
# O=대기사유, P=다음액션, Q=플랫폼명, R=우선순위,
# S=담당자명, T=담당자이메일, U=연락수단/연락처, V=업로드방식, W=업로드주기,
# X=원고 규격, Y=썸네일규격, Z=배너 규격,
# AA=업로드마감시각, AB=업로드요일, AC=업체별 소장코인, AD=업체별 대여코인,
# AE=오픈회차, AF=무료회차, AG=아이디, AH=비번, AI=정산방식, AJ=정산주기상세,
# AK=정산일/입금일, AL=세금계산서/정산서 필요, AM=런칭일,
# AN=FTP/관리자페이지 정보, AO=비고

_COLS = 41  # A~AO

_EDITABLE_COL_MAP = {
    "분류": "B",
    "발표일": "C",
    "플랫폼명": "Q",
    "현재단계": "L",
    "마지막업데이트날짜": "M",
    "마지막상황": "N",
    "마지막 상황": "N",
    "대기사유": "O",
    "다음액션": "P",
    "우선순위": "R",
    "비고": "AO",
}

_READ_RANGE_END = "AO"


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
    """핵심 필드 수정 + M열(마지막업데이트날짜) 자동 기록."""
    cred, sid, tab, id_to_row = _find_row(settings)
    if platform_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {platform_id}")
    row_num = id_to_row[platform_id]
    esc = _tab_esc(tab)

    col_writes: dict[str, str] = {}
    for key, col in _EDITABLE_COL_MAP.items():
        if key == "마지막업데이트날짜":
            continue  # 자동 처리
        if key in fields:
            col_writes[col] = str(fields[key])

    data = [
        {"range": f"'{esc}'!{col}{row_num}", "values": [[val]]}
        for col, val in col_writes.items()
    ]
    # 마지막업데이트날짜 M열 자동 갱신
    data.append({"range": f"'{esc}'!M{row_num}", "values": [[_now_seoul_str()]]})

    if data:
        batch_update_sheet_values(cred, sid, data)
