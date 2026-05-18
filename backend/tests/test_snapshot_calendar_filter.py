"""캘린더 구간 필터 — 시트 형식 날짜(*_raw) 포함."""

from __future__ import annotations

from repositories.snapshot_repo import (
    _filter_tasks_client,
    _filter_upload_rows_client,
    _norm_sheet_ymd,
)


def test_norm_sheet_ymd_dot_format():
    assert _norm_sheet_ymd("2026. 5. 13") == "2026-05-13"


def test_filter_tasks_includes_raw_style_due_date():
    rows = [
        {"업무명": "A", "마감일": "2026. 5. 13"},
        {"업무명": "B", "마감일": "2026-04-01"},
    ]
    out = _filter_tasks_client(rows, "2026-05-01", "2026-05-31")
    assert len(out) == 1
    assert out[0]["업무명"] == "A"


def test_filter_upload_rows_includes_raw_style_dates():
    rows = [
        {"작품명": "X", "업로드일": "2026. 5. 12", "런칭일": ""},
        {"작품명": "Y", "업로드일": "", "런칭일": "2026. 5. 7"},
    ]
    out = _filter_upload_rows_client(rows, "2026-05-01", "2026-05-31")
    titles = {r["작품명"] for r in out}
    assert titles == {"X", "Y"}
