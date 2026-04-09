"""체크리스트·업로드 실데이터로 당일 브리핑을 집계합니다 (규칙 기반, AI 없음)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from schemas import (
    BriefingSummary,
    BriefingTodayResponse,
    ChecklistItem,
    UploadItem,
    UrgentItem,
)

SEOUL = ZoneInfo("Asia/Seoul")


def _checklist_is_sensitive_overdue(item: ChecklistItem) -> bool:
    """검토·정산 등 민감 키워드가 있으면 '지연 주의'로 분류."""
    blob = f"{item.title} {item.note or ''} {item.due_date or ''}"
    return any(k in blob for k in ("검토", "정산", "청구"))


def _upload_seoul_date(uploaded_at: str) -> date | None:
    """
    시트의 uploaded_at 문자열을 서울 날짜로 변환.
    파싱 불가 시 None (집계에서는 후속 필요 건으로 취급).
    """
    raw = (uploaded_at or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=SEOUL)
        return dt.astimezone(SEOUL).date()
    except ValueError:
        return None


def _urgent_uid(
    source: Literal["checklist", "upload"],
    id_value: str,
    uploaded_at_value: str | None,
    row_number: int,
) -> str:
    """시트 내 동일 id·다중 행을 구분하기 위해 행 번호와 시각(또는 n/a)을 포함."""
    at_part = (uploaded_at_value or "").strip() if uploaded_at_value else ""
    if not at_part:
        at_part = "n/a"
    return f"{source}-{id_value}-{at_part}-{row_number}"


def aggregate_briefing_today(
    checklist_rows: list[tuple[ChecklistItem, int]],
    upload_rows: list[tuple[UploadItem, int]],
    *,
    warnings: list[str] | None = None,
    now: datetime | None = None,
) -> BriefingTodayResponse:
    warn_out = list(warnings) if warnings else []

    now_seoul = (now or datetime.now(SEOUL)).astimezone(SEOUL)
    today = now_seoul.date()

    checklist = [c for c, _ in checklist_rows]
    overdue_cl: list[tuple[ChecklistItem, int]] = []
    today_cl: list[ChecklistItem] = []
    for c, row in checklist_rows:
        if _checklist_is_sensitive_overdue(c):
            overdue_cl.append((c, row))
        else:
            today_cl.append(c)

    today_uploads: list[UploadItem] = []
    overdue_uploads: list[tuple[UploadItem, int]] = []
    for u, row in upload_rows:
        d = _upload_seoul_date(u.uploaded_at)
        if d is None:
            # 날짜 파싱 실패: 시트 형식 불일치 가능 → 후속 확인이 필요한 자료로 분류
            overdue_uploads.append((u, row))
        elif d == today:
            today_uploads.append(u)
        elif d < today:
            overdue_uploads.append((u, row))
        # d > today 인 미래 일자는 오늘/지연 집계에서 제외

    summary = BriefingSummary(
        today_checklist_count=len(today_cl),
        overdue_checklist_count=len(overdue_cl),
        today_upload_count=len(today_uploads),
        overdue_upload_count=len(overdue_uploads),
    )

    urgent: list[UrgentItem] = []
    for c, row in overdue_cl:
        if len(urgent) >= 3:
            break
        urgent.append(
            UrgentItem(
                uid=_urgent_uid("checklist", c.id, None, row),
                id=c.id,
                source="checklist",
                title=c.title,
                note=c.note,
                uploaded_at=None,
            )
        )

    def _upload_sort_key(item: tuple[UploadItem, int]) -> date:
        u = item[0]
        d = _upload_seoul_date(u.uploaded_at)
        return d if d is not None else date.min

    overdue_uploads_sorted = sorted(overdue_uploads, key=_upload_sort_key)
    for u, row in overdue_uploads_sorted:
        if len(urgent) >= 3:
            break
        urgent.append(
            UrgentItem(
                uid=_urgent_uid("upload", u.id, u.uploaded_at, row),
                id=u.id,
                source="upload",
                title=u.title,
                note=u.note,
                uploaded_at=u.uploaded_at,
            )
        )

    s1 = (
        f"오늘 손볼 체크리스트는 {summary.today_checklist_count}건이며, "
        f"검토·정산처럼 우선 확인이 필요한 항목은 {summary.overdue_checklist_count}건입니다."
    )
    s2 = (
        f"업로드는 오늘 올라온 것이 {summary.today_upload_count}건, "
        f"이전에 올라와 후속 확인이 필요한 자료는 {summary.overdue_upload_count}건입니다."
    )
    if urgent:
        lead = urgent[0].title
        extra = f" 외 {len(urgent) - 1}건" if len(urgent) > 1 else ""
        s3 = f"긴급 후보로는 「{lead}」{extra}을 먼저 훑어보세요."
    else:
        s3 = "지금은 긴급으로 묶인 항목이 없습니다. 체크리스트와 업로드 목록을 여유 있게 확인하면 됩니다."
    briefing_text = " ".join([s1, s2, s3])

    return BriefingTodayResponse(
        briefing_text=briefing_text,
        summary=summary,
        urgent_items=urgent,
        warnings=warn_out,
    )
