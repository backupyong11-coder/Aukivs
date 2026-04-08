"""시트 셀·행 공통 처리: 빈 값은 결측으로만 다루고 시스템 오류로 취급하지 않는다."""

from __future__ import annotations


def cell_str(cell: object | None) -> str:
    """셀을 문자열로 정규화. None·비문자는 str() 후 앞뒤 공백 제거."""
    if cell is None:
        return ""
    return str(cell).strip()


def is_blank_cell(cell: object | None) -> bool:
    return cell_str(cell) == ""


def parse_optional_str(cell: object | None) -> str | None:
    """비어 있으면 None, 아니면 stripped str."""
    s = cell_str(cell)
    return s if s else None


def padded_row_cells(row: list[object] | None, width: int) -> list[str]:
    """행을 width 길이로 패딩한 뒤 각 셀을 cell_str 로 만든다."""
    base = list(row) if row else []
    base = base + [""] * max(0, width - len(base))
    return [cell_str(base[i]) if i < len(base) else "" for i in range(width)]


def row_all_blank_strings(cells: list[str]) -> bool:
    return not any(cells)
