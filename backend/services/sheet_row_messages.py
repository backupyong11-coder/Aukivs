"""시트 행 관련 사용자/운영자용 문구 (브리핑·업로드 목록 공통)."""


def format_upload_row_excluded(tab: str, sheet_row: int, field_label: str) -> str:
    """
    field_label 예: title(열 B), file_name(열 C), uploaded_at(열 D)
    """
    return f"{tab} {sheet_row}행: {field_label} 비어 있어 제외"


def format_upload_duplicate_id(tab: str, dup_id: str, sheet_rows: list[int]) -> str:
    """동일 A열 id가 둘 이상의 유효 행에 있을 때 안내 문구."""
    rows_fmt = ", ".join(f"{r}행" for r in sorted(sheet_rows))
    return (
        f"{tab}에서 id '{dup_id}'가 여러 행({rows_fmt})에 중복되어 있습니다. "
        "일부 액션 대상이 모호할 수 있습니다."
    )
