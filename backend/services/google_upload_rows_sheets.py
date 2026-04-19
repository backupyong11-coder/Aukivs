"""Google Sheets '업로드정리' 탭 — 전체 열 조회·핵심 필드 수정."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from config import Settings
from .google_sheets import (
    append_rows_to_sheet_range,
    batch_update_sheet_values,
    get_worksheet_id_by_title,
    spreadsheet_id_from_url,
    spreadsheets_batch_update,
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

# 현재 시트 열 구조:
# A=완료, B=업로드일, C=플랫폼명, D=작품명,
# E=업로드화수, F=남은업로드화수, G=업로드완료여부,
# H=업로드주기, I=업로드요일, J=업로드방식, K=런칭일,
# L=마지막업로드일, M=다음업로드일, N=원고준비,
# O=(빈), P=업로드링크/제출처, Q=마지막업로드회수, R=비고
# 구버전: 고정 인덱스·A2:R 읽기(롤백 참고)
# _COLS = 18
# _IDX = dict(
#     완료=0, 업로드일=1, 플랫폼명=2, 작품명=3,
#     업로드화수=4, 남은업로드화수=5, 업로드완료여부=6,
#     업로드주기=7, 업로드요일=8, 업로드방식=9, 런칭일=10,
#     마지막업로드일=11, 다음업로드일=12, 원고준비=13,
#     업로드링크=15, 마지막업로드회수=16, 비고=17,
# )

# API/프론트 논리 키 → 시트 1행 헤더 후보(첫 일치 열 사용). 마지막업로드·업로드링크는 시트 표기 별칭 지원.
_UPLOAD_HEADER_CANDIDATES: dict[str, tuple[str, ...]] = {
    "완료": ("완료",),
    "업로드일": ("업로드일",),
    "플랫폼명": ("플랫폼명",),
    "작품명": ("작품명",),
    "업로드화수": ("업로드화수",),
    "남은업로드화수": ("남은업로드화수",),
    "업로드완료여부": ("업로드완료여부",),
    "업로드주기": ("업로드주기",),
    "업로드요일": ("업로드요일",),
    "업로드방식": ("업로드방식",),
    "런칭일": ("런칭일",),
    "마지막업로드일": ("마지막업로드일",),
    "다음업로드일": ("다음업로드일",),
    "원고준비": ("원고준비",),
    "업로드링크": ("업로드링크/제출처", "업로드링크"),
    "마지막업로드회수": ("마지막업로드화수", "마지막업로드회수"),
    "비고": ("비고",),
}

# create/fields 순서(구 _IDX 키 순서와 동일)
_FIELD_KEYS_ORDER: tuple[str, ...] = tuple(_UPLOAD_HEADER_CANDIDATES.keys())


def _tab_esc(tab: str) -> str:
    return tab.replace("'", "''")


def _ctx(settings: Settings) -> tuple[Path, str, str]:
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError("[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 설정하세요.")
    cred = Path(settings.google_service_account_file).expanduser()
    if not cred.is_file():
        raise SheetsConfigurationError(f"[설정] 서비스 계정 파일 없음: {cred}")
    sid = spreadsheet_id_from_url(settings.google_sheet_url)
    tab = (settings.google_upload_rows_tab or "").strip() or "업로드정리"
    return cred, sid, tab


def _first_header_col_index(header_strs: list[str], candidates: tuple[str, ...]) -> int | None:
    """시트 1행에서 후보 문자열과 일치하는 첫 열 인덱스(0-based)."""
    for cand in candidates:
        for j, h in enumerate(header_strs):
            if h == cand:
                return j
    return None


def _build_upload_col_map(header_strs: list[str]) -> dict[str, int]:
    """1행 헤더로 논리 필드명 → 열 인덱스 맵을 만든다(업로드정리 전용)."""
    col_map: dict[str, int] = {}
    for logical, candidates in _UPLOAD_HEADER_CANDIDATES.items():
        idx = _first_header_col_index(header_strs, candidates)
        if idx is not None:
            col_map[logical] = idx
        else:
            logger.warning(
                "[업로드정리] 헤더를 찾지 못했습니다(논리 필드 '%s', 후보 %s).",
                logical,
                candidates,
            )
    return col_map


def _upload_sheet_read_state(
    settings: Settings,
) -> tuple[Path, str, str, list[str], int, list[list], dict[str, int]]:
    """read_tasks_header_column_map으로 A1:ZZ 한 번 읽고, 업무정리용 col_map은 버리고 업로드용 col_map만 쓴다."""
    cred, sid, tab = _ctx(settings)
    _, width, header_strs, data_rows = read_tasks_header_column_map(cred, sid, tab)
    col_map = _build_upload_col_map(header_strs)
    return cred, sid, tab, header_strs, width, data_rows, col_map


def _uc(cells: list[str], col_map: dict[str, int], key: str) -> str:
    # 구버전: idx = _IDX.get(key, -1); return cells[idx] if 0 <= idx < len(cells) else ""
    idx = col_map.get(key)
    if idx is None:
        return ""
    if idx >= len(cells):
        return ""
    return cells[idx]


def _row_id(sheet_row: int) -> str:
    return f"upload-row-{sheet_row}"


def fetch_upload_rows(settings: Settings) -> list[dict]:
    _, _, tab, header_strs, width, data_rows, col_map = _upload_sheet_read_state(settings)
    # 임시: Fly logs에서 업로드정리 탭 1행 헤더·열 매핑 확인용 — 확인 후 제거
    logger.info(
        "[업로드정리][debug] fetch_upload_rows tab=%r width=%s row1_headers=%s",
        tab,
        width,
        header_strs,
    )
    logger.info(
        "[업로드정리][debug] fetch_upload_rows col_map=%s",
        {k: header_strs[v] if v < len(header_strs) else v for k, v in col_map.items()},
    )
    if col_map.get("작품명") is None:
        logger.warning("[업로드정리] '작품명' 헤더가 없어 목록을 비웁니다.")
        return []
    out = []
    _debug_first_valid = True
    for sheet_row, row in enumerate(data_rows, start=2):
        cells = padded_row_cells(row if isinstance(row, list) else [], width)
        작품명 = _uc(cells, col_map, "작품명").strip()
        if not 작품명:
            continue
        if _debug_first_valid:
            _debug_first_valid = False
            logger.info(
                "[업로드정리][debug] first_valid_row sheet_row=%s row1_headers=%s col_map=%s raw_cells=%s "
                "mapped 작품명=%r 업로드일=%r 업로드방식=%r 런칭일=%r 마지막업로드일=%r 다음업로드일=%r",
                sheet_row,
                header_strs,
                col_map,
                list(cells),
                작품명,
                _uc(cells, col_map, "업로드일"),
                _uc(cells, col_map, "업로드방식"),
                _uc(cells, col_map, "런칭일"),
                _uc(cells, col_map, "마지막업로드일"),
                _uc(cells, col_map, "다음업로드일"),
            )
        out.append({
            "id": _row_id(sheet_row),
            "sheet_row": sheet_row,
            "완료": _uc(cells, col_map, "완료"),
            "업로드일": _uc(cells, col_map, "업로드일"),
            "플랫폼명": _uc(cells, col_map, "플랫폼명"),
            "작품명": 작품명,
            "업로드화수": _uc(cells, col_map, "업로드화수"),
            "남은업로드화수": _uc(cells, col_map, "남은업로드화수"),
            "업로드완료여부": _uc(cells, col_map, "업로드완료여부"),
            "업로드주기": _uc(cells, col_map, "업로드주기"),
            "업로드요일": _uc(cells, col_map, "업로드요일"),
            "업로드방식": _uc(cells, col_map, "업로드방식"),
            "런칭일": _uc(cells, col_map, "런칭일"),
            "마지막업로드일": _uc(cells, col_map, "마지막업로드일"),
            "다음업로드일": _uc(cells, col_map, "다음업로드일"),
            "원고준비": _uc(cells, col_map, "원고준비"),
            "업로드링크": _uc(cells, col_map, "업로드링크"),
            "마지막업로드회수": _uc(cells, col_map, "마지막업로드회수"),
            "비고": _uc(cells, col_map, "비고"),
            "다음업로드회수": "",
        })
    return out


def _find_row(
    settings: Settings,
) -> tuple[Path, str, str, dict[str, int], dict[str, int], list[str], int]:
    cred, sid, tab, header_strs, width, data_rows, col_map = _upload_sheet_read_state(settings)
    id_to_row: dict[str, int] = {}
    작품명_idx = col_map.get("작품명")
    if 작품명_idx is None:
        logger.warning("[업로드정리] '작품명' 헤더를 찾지 못해 행 id 맵을 비웁니다.")
        return cred, sid, tab, id_to_row, col_map, header_strs, width
    for sheet_row, row in enumerate(data_rows, start=2):
        cells = padded_row_cells(row if isinstance(row, list) else [], width)
        if 작품명_idx < len(cells) and cells[작품명_idx].strip():
            id_to_row[_row_id(sheet_row)] = sheet_row
    return cred, sid, tab, id_to_row, col_map, header_strs, width


def create_upload_row(settings: Settings, fields: dict) -> dict:
    cred, sid, tab, header_strs, width, _data_rows, col_map = _upload_sheet_read_state(settings)
    작품명 = str(fields.get("작품명", "")).strip()
    if not 작품명:
        raise SheetsParseError("[파싱] 작품명은 비울 수 없습니다.")
    if width <= 0 or not header_strs:
        logger.warning("[업로드정리] 시트 헤더가 없어 행을 추가할 수 없습니다.")
        raise SheetsParseError("[파싱] 시트 헤더(1행)가 없습니다.")
    if col_map.get("작품명") is None:
        logger.warning("[업로드정리] '작품명' 열을 찾지 못했습니다.")
        raise SheetsParseError("[파싱] 시트에 '작품명' 열이 없습니다.")
    row = [""] * width
    for key in _FIELD_KEYS_ORDER:
        idx = col_map.get(key)
        if idx is None:
            continue
        val = str(fields.get(key, "")).strip()
        if val:
            row[idx] = val
    esc = _tab_esc(tab)
    last_col = _col_index_to_a1_letters_zero_based(max(0, width - 1))
    # 구버전: append_rows_to_sheet_range(..., f"'{esc}'!A:R", [row])
    updated = append_rows_to_sheet_range(cred, sid, f"'{esc}'!A:{last_col}", [row])
    m = re.search(r"!([A-Za-z]+)(\d+)", updated or "")
    sheet_row = int(m.group(2)) if m else 0
    rest = {k: str(fields.get(k, "")) for k in _FIELD_KEYS_ORDER if k != "작품명"}
    return {
        "id": _row_id(sheet_row),
        "sheet_row": sheet_row,
        "작품명": 작품명,
        "다음업로드회수": "",
        **rest,
    }


# 구버전: 필드명 → 고정 열 문자
# _EDITABLE_COL_MAP = {
#     "완료": "A", "업로드일": "B", "플랫폼명": "C", "작품명": "D",
#     "업로드화수": "E", "남은업로드화수": "F",
#     "업로드완료여부": "G", "업로드주기": "H", "업로드요일": "I",
#     "업로드방식": "J", "런칭일": "K", "마지막업로드일": "L",
#     "다음업로드일": "M", "원고준비": "N",
#     "업로드링크": "P", "마지막업로드회수": "Q", "비고": "R",
# }


def update_upload_row(settings: Settings, row_id: str, fields: dict) -> None:
    cred, sid, tab, id_to_row, col_map, _, _ = _find_row(settings)
    if row_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {row_id}")
    row_num = id_to_row[row_id]
    esc = _tab_esc(tab)
    data = []
    for key in _FIELD_KEYS_ORDER:
        if key not in fields:
            continue
        idx = col_map.get(key)
        if idx is None:
            logger.warning(
                "[업로드정리] 수정 필드 '%s'에 해당하는 헤더가 없어 건너뜁니다.",
                key,
            )
            continue
        col = _col_index_to_a1_letters_zero_based(idx)
        data.append({"range": f"'{esc}'!{col}{row_num}", "values": [[str(fields[key])]]})
    if data:
        batch_update_sheet_values(cred, sid, data)


def delete_upload_row(settings: Settings, row_id: str) -> None:
    cred, sid, tab, id_to_row, _, _, _ = _find_row(settings)
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
