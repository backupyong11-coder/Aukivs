"""Google Sheets '업무정리' 탭 — 조회·추가·수정·삭제."""

from __future__ import annotations

import logging
import re
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

logger = logging.getLogger(__name__)

# --- 구버전: 고정 인덱스(A~U) 매핑 (롤백·비교용, 런타임 미사용) ---
# # 업무정리 탭 열 매핑 (A~U):
# # A=날짜그룹, B=우선순위, C=완료, D=마감일, E=분야, F=분류, G=정량화 분,
# # H=업무명, I=정량화, J=정량화 구분, K=시간, L=시간변환, M=관련플랫폼, N=세부수치,
# # O=세부단위(두 번째 세부수치 열), P=관련작품, Q=난이도, R=피로도, S=상태,
# # T=담당자/요청주체, U=메모
# _COLS = 21
# _IDX = dict(
#     날짜그룹=0,
#     우선순위=1,
#     완료=2,
#     마감일=3,
#     분야=4,
#     분류=5,
#     **{"정량화 분": 6},
#     업무명=7,
#     정량화=8,
#     **{"정량화 구분": 9},
#     시간=10,
#     시간변환=11,
#     관련플랫폼=12,
#     세부수치=13,
#     세부단위=14,
#     관련작품=15,
#     난이도=16,
#     피로도=17,
#     상태=18,
#     담당자=19,
#     메모=20,
# )

# API·프론트 고정 키 순서(응답 스키마 유지)
_TASK_FIELD_KEYS: tuple[str, ...] = (
    "날짜그룹",
    "우선순위",
    "완료",
    "마감일",
    "분야",
    "분류",
    "정량화 분",
    "업무명",
    "정량화",
    "정량화 구분",
    "시간",
    "시간변환",
    "관련플랫폼",
    "세부수치",
    "세부단위",
    "관련작품",
    "난이도",
    "피로도",
    "상태",
    "담당자",
    "메모",
)

# 시트 헤더 문자열 별칭 → 동일 논리 필드 (첫 매칭 열만 사용)
_TASK_HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "정량화 분": ("정량화 분", "정량화 분류"),
    "담당자": ("담당자", "담당자/요청주체"),
}


def build_tasks_column_map_from_header(header_cells: list[str]) -> dict[str, int]:
    """
    1행 헤더 문자열로부터 API 필드명 → 0-based 열 인덱스 맵을 만든다.
    동일 헤더「세부수치」가 두 번 나오면 첫 열=세부수치, 둘째 열=세부단위로 본다.
    매핑되지 않는 필드는 경고만 하고 맵에서 생략한다.
    """
    headers = [str(h).strip() if h is not None else "" for h in header_cells]
    col_map: dict[str, int] = {}
    assigned: set[int] = set()

    sebu_idx = [i for i, h in enumerate(headers) if h == "세부수치"]
    if len(sebu_idx) >= 1:
        col_map["세부수치"] = sebu_idx[0]
        assigned.add(sebu_idx[0])
    if len(sebu_idx) >= 2:
        col_map["세부단위"] = sebu_idx[1]
        assigned.add(sebu_idx[1])
    elif len(sebu_idx) == 1:
        logger.warning(
            "[업무정리] '세부수치' 헤더가 한 열뿐이라 '세부단위'는 매핑하지 않습니다.",
        )

    for logical in _TASK_FIELD_KEYS:
        if logical in ("세부수치", "세부단위"):
            continue
        candidates = _TASK_HEADER_ALIASES.get(logical, (logical,))
        for idx, h in enumerate(headers):
            if idx in assigned:
                continue
            if h in candidates or h == logical:
                col_map[logical] = idx
                assigned.add(idx)
                break

    for logical in _TASK_FIELD_KEYS:
        if logical not in col_map:
            logger.warning(
                "[업무정리] 헤더를 찾지 못했습니다(필드 '%s' → 빈 값).", logical
            )
    return col_map


def read_tasks_header_column_map(
    cred: Path, spreadsheet_id: str, tab: str
) -> tuple[dict[str, int], int, list[str], list[list]]:
    """A1:ZZ 한 번 읽어 1행으로 col_map을 만들고, 2행 이후 데이터 행만 반환(체크리스트·업무정리 공통)."""
    esc = tab.replace("'", "''")
    all_rows = read_sheet_tab_values(cred, spreadsheet_id, f"'{esc}'!A1:ZZ")
    if not all_rows:
        return {}, 0, [], []
    header_strs = [str(c).strip() if c is not None else "" for c in all_rows[0]]
    col_map = build_tasks_column_map_from_header(header_strs)
    width = len(all_rows[0])
    data_rows = all_rows[1:]
    return col_map, width, header_strs, data_rows


def _col_index_to_a1_letters_zero_based(idx: int) -> str:
    """0-based 열 인덱스 → A1 열 문자(A, B, …, Z, AA, …)."""
    n = idx + 1
    letters = ""
    while n:
        n, r = divmod(n - 1, 26)
        letters = chr(65 + r) + letters
    return letters


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


def _c(cells: list[str], key: str, col_map: dict[str, int]) -> str:
    # 구버전: return cells[_IDX[key]] if _IDX[key] < len(cells) else ""
    idx = col_map.get(key)
    if idx is None:
        return ""
    if idx >= len(cells):
        return ""
    return cells[idx]


def _row_id(sheet_row: int) -> str:
    return f"task-row-{sheet_row}"


def fetch_tasks(settings: Settings) -> list[dict]:
    """시트 1행 헤더로 열 위치를 해석해 행을 dict로 만든다(열 순서 변경에 대응)."""
    cred, sid, tab = _ctx(settings)
    esc = _tab_esc(tab)
    all_rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A1:ZZ")
    if not all_rows:
        logger.warning("[업무정리] 시트에 데이터가 없습니다.")
        return []
    header_strs = [str(c).strip() if c is not None else "" for c in all_rows[0]]
    col_map = build_tasks_column_map_from_header(header_strs)
    width = len(all_rows[0])
    out = []
    for i, row in enumerate(all_rows[1:], start=2):
        cells = padded_row_cells(row if isinstance(row, list) else [], width)
        title = _c(cells, "업무명", col_map).strip()
        if not title:
            continue
        out.append({
            "id": _row_id(i),
            "sheet_row": i + 2,
            "날짜그룹": _c(cells, "날짜그룹", col_map),
            "우선순위": _c(cells, "우선순위", col_map),
            "완료": _c(cells, "완료", col_map),
            "마감일": _c(cells, "마감일", col_map),
            "분야": _c(cells, "분야", col_map),
            "분류": _c(cells, "분류", col_map),
            "정량화 분": _c(cells, "정량화 분", col_map),
            "업무명": title,
            "정량화": _c(cells, "정량화", col_map),
            "정량화 구분": _c(cells, "정량화 구분", col_map),
            "시간": _c(cells, "시간", col_map),
            "시간변환": _c(cells, "시간변환", col_map),
            "관련플랫폼": _c(cells, "관련플랫폼", col_map),
            "세부수치": _c(cells, "세부수치", col_map),
            "세부단위": _c(cells, "세부단위", col_map),
            "관련작품": _c(cells, "관련작품", col_map),
            "난이도": _c(cells, "난이도", col_map),
            "피로도": _c(cells, "피로도", col_map),
            "상태": _c(cells, "상태", col_map),
            "담당자": _c(cells, "담당자", col_map),
            "메모": _c(cells, "메모", col_map),
        })
    return out


def create_task(settings: Settings, fields: dict) -> dict:
    """헤더 기준 열 너비로 행을 채운 뒤 시트 맨 아래에 붙인다."""
    cred, sid, tab = _ctx(settings)
    title = str(fields.get("업무명", "")).strip()
    if not title:
        raise SheetsParseError("[파싱] 업무명은 비울 수 없습니다.")
    esc = _tab_esc(tab)
    head_rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A1:ZZ")
    if not head_rows:
        logger.warning("[업무정리] 헤더 행이 없어 빈 너비로 행을 추가할 수 없습니다.")
        raise SheetsParseError("[파싱] 업무정리 탭에 헤더(1행)가 없습니다.")
    header_strs = [str(c).strip() if c is not None else "" for c in head_rows[0]]
    col_map = build_tasks_column_map_from_header(header_strs)
    width = len(head_rows[0])
    if "업무명" not in col_map:
        logger.warning("[업무정리] '업무명' 헤더가 없어 열을 지정할 수 없습니다.")
        raise SheetsParseError("[파싱] 시트에 '업무명' 열 헤더가 없습니다.")
    row = [""] * width
    row[col_map["업무명"]] = title
    for key in (
        "날짜그룹",
        "우선순위",
        "완료",
        "마감일",
        "분야",
        "분류",
        "정량화 분",
        "정량화",
        "정량화 구분",
        "시간",
        "시간변환",
        "관련플랫폼",
        "세부수치",
        "세부단위",
        "관련작품",
        "난이도",
        "피로도",
        "상태",
        "담당자",
        "메모",
    ):
        val = str(fields.get(key, "")).strip()
        if not val:
            continue
        idx = col_map.get(key)
        if idx is None:
            logger.warning("[업무정리] create: 필드 '%s'에 해당 헤더 열이 없어 건너뜁니다.", key)
            continue
        row[idx] = val
    end_letter = _col_index_to_a1_letters_zero_based(width - 1)
    updated = append_rows_to_sheet_range(cred, sid, f"'{esc}'!A:{end_letter}", [row])
    m = re.search(r"!([A-Za-z]+)(\d+)", updated or "")
    sheet_row = int(m.group(2)) if m else 0
    return {
        "id": _row_id(sheet_row), "sheet_row": sheet_row, "업무명": title,
        **{
            k: str(fields.get(k, ""))
            for k in (
                "날짜그룹",
                "우선순위",
                "완료",
                "마감일",
                "분야",
                "분류",
                "정량화 분",
                "정량화",
                "정량화 구분",
                "시간",
                "시간변환",
                "관련플랫폼",
                "세부수치",
                "세부단위",
                "관련작품",
                "난이도",
                "피로도",
                "상태",
                "담당자",
                "메모",
            )
        }
    }


def _find_row(
    settings: Settings,
) -> tuple[Path, str, str, dict[str, int], dict[str, int]]:
    """id→시트 행번호와, 같은 1행에서 만든 열 맵을 함께 반환한다."""
    cred, sid, tab = _ctx(settings)
    esc = _tab_esc(tab)
    all_rows = read_sheet_tab_values(cred, sid, f"'{esc}'!A1:ZZ")
    id_to_row: dict[str, int] = {}
    if not all_rows:
        return cred, sid, tab, id_to_row, {}
    header_strs = [str(c).strip() if c is not None else "" for c in all_rows[0]]
    col_map = build_tasks_column_map_from_header(header_strs)
    width = len(all_rows[0])
    for i, row in enumerate(all_rows[1:], start=2):
        cells = padded_row_cells(row if isinstance(row, list) else [], width)
        if _c(cells, "업무명", col_map).strip():
            id_to_row[_row_id(i)] = i
    return cred, sid, tab, id_to_row, col_map


def update_task(settings: Settings, task_id: str, fields: dict) -> None:
    """필드별 열 문자를 헤더 맵에서 계산해 부분 갱신한다."""
    cred, sid, tab, id_to_row, col_map = _find_row(settings)
    if task_id not in id_to_row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {task_id}")
    row_num = id_to_row[task_id]
    esc = _tab_esc(tab)
    # 구버전: col_map = { "날짜그룹": "A", ... "메모": "U" } 고정
    data = []
    for key in col_map:
        if key not in fields:
            continue
        idx = col_map[key]
        col = _col_index_to_a1_letters_zero_based(idx)
        data.append({"range": f"'{esc}'!{col}{row_num}", "values": [[str(fields[key])]]})
    if data:
        batch_update_sheet_values(cred, sid, data)


def delete_task(settings: Settings, task_id: str) -> None:
    cred, sid, tab, id_to_row, _ = _find_row(settings)
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
