from datetime import datetime

from schemas import ChecklistItem, UploadItem
from services.briefing_aggregate import SEOUL, aggregate_briefing_today


def test_aggregate_sensitive_checklist_split() -> None:
    cl = [
        (ChecklistItem(id="a", title="일반 할 일", note=None), 2),
        (ChecklistItem(id="b", title="청구서 검토", note=None), 3),
    ]
    r = aggregate_briefing_today(cl, [], now=datetime(2026, 4, 4, 12, 0, tzinfo=SEOUL))
    assert r.summary.today_checklist_count == 1
    assert r.summary.overdue_checklist_count == 1
    assert len(r.urgent_items) >= 1
    assert r.urgent_items[0].source == "checklist"
    assert r.urgent_items[0].uid == "checklist-b-n/a-3"
    assert r.warnings == []


def test_aggregate_upload_today_vs_overdue() -> None:
    fixed_now = datetime(2026, 4, 4, 12, 0, tzinfo=SEOUL)
    uploads = [
        (
            UploadItem(
                id="t",
                title="오늘",
                file_name="a.png",
                uploaded_at="2026-04-04T10:00:00+09:00",
                note=None,
            ),
            2,
        ),
        (
            UploadItem(
                id="p",
                title="과거",
                file_name="b.png",
                uploaded_at="2026-04-01T10:00:00+09:00",
                note=None,
            ),
            3,
        ),
    ]
    r = aggregate_briefing_today([], uploads, now=fixed_now)
    assert r.summary.today_upload_count == 1
    assert r.summary.overdue_upload_count == 1


def test_aggregate_unparseable_upload_counts_as_overdue() -> None:
    uploads = [
        (
            UploadItem(
                id="bad",
                title="날짜 이상",
                file_name="x.png",
                uploaded_at="not-iso",
                note=None,
            ),
            4,
        ),
    ]
    r = aggregate_briefing_today([], uploads, now=datetime(2026, 4, 4, tzinfo=SEOUL))
    assert r.summary.today_upload_count == 0
    assert r.summary.overdue_upload_count == 1


def test_future_upload_excluded_from_counts() -> None:
    uploads = [
        (
            UploadItem(
                id="f",
                title="미래",
                file_name="f.png",
                uploaded_at="2030-01-01T00:00:00+09:00",
                note=None,
            ),
            2,
        ),
    ]
    r = aggregate_briefing_today([], uploads, now=datetime(2026, 4, 4, tzinfo=SEOUL))
    assert r.summary.today_upload_count == 0
    assert r.summary.overdue_upload_count == 0


def test_same_upload_id_different_rows_distinct_uids() -> None:
    uploads = [
        (
            UploadItem(
                id="페니스",
                title="첫 줄",
                file_name="a.png",
                uploaded_at="2026-04-01T09:15:00+09:00",
                note="n1",
            ),
            3,
        ),
        (
            UploadItem(
                id="페니스",
                title="둘째",
                file_name="b.png",
                uploaded_at="2026-04-02T09:15:00+09:00",
                note="n2",
            ),
            7,
        ),
    ]
    r = aggregate_briefing_today([], uploads, now=datetime(2026, 4, 10, 12, 0, tzinfo=SEOUL))
    upload_uids = [u.uid for u in r.urgent_items if u.source == "upload"]
    assert len(upload_uids) == 2
    assert len(set(upload_uids)) == 2
    assert "upload-페니스-2026-04-01T09:15:00+09:00-3" in upload_uids
    assert "upload-페니스-2026-04-02T09:15:00+09:00-7" in upload_uids


def test_warnings_passed_through() -> None:
    w = ["업로드운영 3행: uploaded_at(열 D) 비어 있어 제외"]
    r = aggregate_briefing_today([], [], warnings=w)
    assert r.warnings == w
