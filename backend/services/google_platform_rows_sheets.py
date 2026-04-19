"""Google Sheets '플랫폼정리' 탭 — 조회·핵심 필드 수정 (마지막업데이트날짜 자동)."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from config import Settings
from .google_sheets import (
    append_rows_to_sheet_range,
    batch_update_sheet_values,
    spreadsheet_id_from_url,
)
from .google_tasks_sheets import (
    _col_index_to_a1_letters_zero_based,
    read_tasks_header_column_map,
)
from .sheet_cell_utils import padded_row_cells
from .sheets_errors import (
    SheetsConfigurationError,
    SheetsNotFoundError,
    SheetsParseError,
)

logger = logging.getLogger(__name__)

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

# 구버전: 고정 열 문자(롤백·비교용)
# _COLS = 41  # A~AO
# _EDITABLE_COL_MAP = {
#     "분류": "B",
#     "발표일": "C",
#     "플랫폼명": "Q",
#     "현재단계": "L",
#     "마지막업데이트날짜": "M",
#     "마지막상황": "N",
#     "마지막 상황": "N",
#     "대기사유": "O",
#     "다음액션": "P",
#     "우선순위": "R",
#     "비고": "AO",
# }
# _READ_RANGE_END = "AO"

# API 필드 키 → 시트 1행에서 찾을 헤더 후보(첫 매칭 열 사용)
_EDITABLE_HEADER_CANDIDATES: dict[str, tuple[str, ...]] = {
    "분류": ("분류",),
    "발표일": ("발표일",),
    "플랫폼명": ("플랫폼명",),
    "현재단계": ("현재단계",),
    "마지막업데이트날짜": ("마지막업데이트날짜",),
    "마지막상황": ("마지막 상황", "마지막상황"),
    "마지막 상황": ("마지막 상황", "마지막상황"),
    "대기사유": ("대기사유",),
    "다음액션": ("다음액션",),
    "우선순위": ("우선순위",),
    "비고": ("비고", "메모"),
}

# 생성 시 채울 필드 순서(헤더 매핑은 후보만 사용; 마지막업데이트날짜는 자동이므로 생성 행에서는 비움)
_PLATFORM_CREATE_HEADER_CANDIDATES: dict[str, tuple[str, ...]] = {
    "회사명": ("회사명",),
    **_EDITABLE_HEADER_CANDIDATES,
}
_PLATFORM_CREATE_FIELD_ORDER: tuple[str, ...] = (
    "회사명",
    "분류",
    "발표일",
    "플랫폼명",
    "현재단계",
    "마지막상황",
    "대기사유",
    "다음액션",
    "우선순위",
    "비고",
)


def _build_platform_col_map(header_strs: list[str]) -> dict[str, int]:
    """논리 키 → 0-based 열 인덱스(마지막 상황 별칭은 '마지막상황' 하나만 등록)."""
    col_map: dict[str, int] = {}
    for logical, candidates in _PLATFORM_CREATE_HEADER_CANDIDATES.items():
        if logical == "마지막 상황":
            continue
        idx = _first_col_index_for_headers(header_strs, candidates)
        if idx is not None:
            col_map[logical] = idx
    return col_map


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


def _first_col_index_for_headers(header_strs: list[str], candidates: tuple[str, ...]) -> int | None:
    """헤더 1행에서 후보 문자열과 일치하는 첫 열 인덱스(0-based); 없으면 None."""
    for cand in candidates:
        for j, h in enumerate(header_strs):
            if h == cand:
                return j
    return None


def _platform_sheet_read(
    settings: Settings,
) -> tuple[Path, str, str, list[str], int, list[list]]:
    """read_tasks_header_column_map으로 A1:ZZ 한 번 읽고 1행·너비·데이터행만 사용(업무정리용 col_map은 사용하지 않음)."""
    cred, sid, tab = _ctx(settings)
    _, width, header_strs, data_rows = read_tasks_header_column_map(cred, sid, tab)
    return cred, sid, tab, header_strs, width, data_rows


def _now_seoul_str() -> str:
    return datetime.now(_SEOUL).strftime("%Y-%m-%d %H:%M:%S")


def _row_id(sheet_row: int) -> str:
    return f"platform-row-{sheet_row}"


def fetch_platforms(settings: Settings) -> list[dict]:
    _, _, _, header_strs, width, data_rows = _platform_sheet_read(settings)
    out = []
    for i, row in enumerate(data_rows, start=2):
        cells = padded_row_cells(row if isinstance(row, list) else [], width)
        rec: dict = {"id": _row_id(i), "sheet_row": i}
        for j, h in enumerate(header_strs):
            rec[h if h else f"_col_{j+1}"] = str(cells[j]).strip() if j < len(cells) and cells[j] else ""
        company = rec.get("회사명", "").strip()
        if not company:
            continue
        out.append(rec)
    return out


def _find_row(
    settings: Settings,
) -> tuple[Path, str, str, dict[str, int], list[str], int]:
    cred, sid, tab, header_strs, width, data_rows = _platform_sheet_read(settings)
    id_to_row: dict[str, int] = {}
    company_idx = _first_col_index_for_headers(header_strs, ("회사명",))
    if company_idx is None:
        logger.warning("[플랫폼정리] '회사명' 헤더를 찾지 못해 행 id 맵을 비웁니다.")
        return cred, sid, tab, id_to_row, header_strs, width
    for i, row in enumerate(data_rows, start=2):
        cells = padded_row_cells(row if isinstance(row, list) else [], width)
        if company_idx < len(cells) and cells[company_idx].strip():
            id_to_row[_row_id(i)] = i
    return cred, sid, tab, id_to_row, header_strs, width


def create_platform_row(settings: Settings, fields: dict) -> dict:
    """헤더 기준으로 빈 행을 만들어 append. 회사명(A)·플랫폼명(Q) 중 하나는 값+열이 있어야 함."""
    cred, sid, tab, header_strs, width, _data_rows = _platform_sheet_read(settings)
    if width <= 0 or not header_strs:
        logger.warning("[플랫폼정리] 시트 헤더가 없어 행을 추가할 수 없습니다.")
        raise SheetsParseError("[파싱] 시트 헤더(1행)가 없습니다.")

    col_map = _build_platform_col_map(header_strs)
    c_name = str(fields.get("회사명", "")).strip()
    p_name = str(fields.get("플랫폼명", "")).strip()
    if not c_name and not p_name:
        raise SheetsParseError("[파싱] 회사명과 플랫폼명을 모두 비울 수 없습니다.")

    idx_company = col_map.get("회사명")
    idx_platform = col_map.get("플랫폼명")
    placed = False
    if idx_company is not None and c_name:
        placed = True
    if idx_platform is not None and p_name:
        placed = True
    if not placed:
        raise SheetsParseError(
            "[파싱] 회사명 또는 플랫폼명 중 입력한 값을 넣을 열을 시트에서 찾지 못했습니다. "
            "(회사명·플랫폼명 열 헤더와 입력값을 확인하세요.)",
        )

    row = [""] * width
    for key in _PLATFORM_CREATE_FIELD_ORDER:
        if key == "마지막업데이트날짜":
            continue
        idx = col_map.get(key)
        if idx is None:
            continue
        val = str(fields.get(key, "")).strip()
        if val:
            row[idx] = val

    esc = _tab_esc(tab)
    last_col = _col_index_to_a1_letters_zero_based(max(0, width - 1))
    updated = append_rows_to_sheet_range(cred, sid, f"'{esc}'!A:{last_col}", [row])
    m = re.search(r"!([A-Za-z]+)(\d+)", updated or "")
    sheet_row = int(m.group(2)) if m else 0

    out: dict = {"id": _row_id(sheet_row), "sheet_row": sheet_row}
    for j, h in enumerate(header_strs):
        key = h if h else f"_col_{j+1}"
        out[key] = str(row[j]).strip() if j < len(row) else ""
    return out


def update_platform(settings: Settings, platform_id: str, fields: dict) -> None:
    """핵심 필드 수정 + M열(마지막업데이트날짜) 자동 기록."""
    cred, sid, tab, id_to_row, header_strs, _ = _find_row(settings)
    if platform_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {platform_id}")
    row_num = id_to_row[platform_id]
    esc = _tab_esc(tab)

    col_writes: dict[str, str] = {}
    for key, candidates in _EDITABLE_HEADER_CANDIDATES.items():
        if key == "마지막업데이트날짜":
            continue  # 자동 처리
        if key not in fields:
            continue
        idx = _first_col_index_for_headers(header_strs, candidates)
        if idx is None:
            logger.warning(
                "[플랫폼정리] 편집 필드 '%s'에 맞는 헤더를 찾지 못해 해당 값은 쓰지 않습니다.",
                key,
            )
            continue
        col_writes[_col_index_to_a1_letters_zero_based(idx)] = str(fields[key])

    data = [
        {"range": f"'{esc}'!{col}{row_num}", "values": [[val]]}
        for col, val in col_writes.items()
    ]
    auto_idx = _first_col_index_for_headers(header_strs, ("마지막업데이트날짜",))
    if auto_idx is None:
        logger.warning(
            "[플랫폼정리] '마지막업데이트날짜' 헤더를 찾지 못해 자동 시각을 기록하지 않습니다.",
        )
    else:
        data.append(
            {
                "range": f"'{esc}'!{_col_index_to_a1_letters_zero_based(auto_idx)}{row_num}",
                "values": [[_now_seoul_str()]],
            }
        )

    if data:
        batch_update_sheet_values(cred, sid, data)
