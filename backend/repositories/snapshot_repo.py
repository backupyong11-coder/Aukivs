"""화면 진입용 경량 스냅샷(캘린더·챗봇·플랫폼 매트릭스). Supabase 우선, 시트는 제한적 폴백."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from config import Settings
from repositories import memos_repo, platform_rows_repo, tasks_repo, upload_rows_repo, works_repo
from schemas import ChecklistItem, MemoItem
from services.google_master_sheets import fetch_master_tab_keyed_rows
from services.google_memo_sheets import fetch_memos_from_google_sheets
from services.google_platform_rows_sheets import fetch_platforms
from services.google_tasks_sheets import fetch_tasks
from services.google_upload_rows_sheets import fetch_upload_rows
from services.sheets_errors import SheetsParseError

_SEOUL = ZoneInfo("Asia/Seoul")

_UPLOAD_CALENDAR_SELECT = (
    "id,legacy_id,sheet_row,completed,upload_date,upload_date_raw,platform_name,work_title,"
    "uploaded_episodes,launch_date,launch_date_raw"
)

_TASK_CALENDAR_SELECT = (
    "id,legacy_id,sheet_row,title,due_date,due_date_raw,completed,platform,domain,category,"
    "priority,status,assignee,memo,related_work,quantification,quantification_type,"
    "detail_value,detail_unit,difficulty,fatigue,time_raw,time_converted,date_group"
)


def _parse_ymd(s: str) -> date:
    return date.fromisoformat(s.strip()[:10])


def _ymd_bounds(from_ymd: str, to_ymd: str) -> tuple[str, str]:
    """PostgREST timestamptz 필터용 ISO 시작·끝(서울 일자 경계)."""
    d0 = _parse_ymd(from_ymd)
    d1 = _parse_ymd(to_ymd)
    start = datetime(d0.year, d0.month, d0.day, 0, 0, 0, tzinfo=_SEOUL).isoformat()
    end = datetime(d1.year, d1.month, d1.day, 23, 59, 59, tzinfo=_SEOUL).isoformat()
    return start, end


def _norm_sheet_ymd(val: object) -> str:
    """시트/DB 날짜 문자열 → YYYY-MM-DD (프론트 normalizeSheetDateYmd 와 동일 규칙)."""
    if val is None:
        return ""
    if isinstance(val, date):
        return val.isoformat()
    s = str(val).strip()
    if not s:
        return ""
    if len(s) >= 10 and s[4] == "-":
        return s[:10]
    compact = re.sub(r"[./]", "-", s)
    compact = re.sub(r"\s+", "", compact)
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", compact)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    return ""


def _in_range_ymd(ymd: str, from_ymd: str, to_ymd: str) -> bool:
    if not ymd:
        return False
    return from_ymd <= ymd <= to_ymd


def _upload_rows_in_range_supabase(
    settings: Settings, from_ymd: str, to_ymd: str
) -> list[dict[str, Any]]:
    cli = upload_rows_repo._client(settings)
    d0, d1 = _parse_ymd(from_ymd), _parse_ymd(to_ymd)
    by_id: dict[str, dict[str, Any]] = {}

    def merge(rows: list[Any]) -> None:
        if not isinstance(rows, list):
            return
        for row in rows:
            if not isinstance(row, dict):
                continue
            d = upload_rows_repo._api_dict(row)
            if not str(d.get("작품명") or "").strip():
                continue
            rid = str(d.get("id") or "")
            if rid:
                by_id[rid] = d

    for col, gte, lte in (
        ("upload_date", f"gte.{d0.isoformat()}", f"lte.{d1.isoformat()}"),
        ("launch_date", f"gte.{d0.isoformat()}", f"lte.{d1.isoformat()}"),
    ):
        rows = cli.get_json(
            "/upload_rows",
            params={
                "select": _UPLOAD_CALENDAR_SELECT,
                "and": f"({col}.{gte},{col}.{lte})",
                "order": "sheet_row.asc.nullslast",
                "limit": "500",
            },
        )
        merge(rows if isinstance(rows, list) else [])

    return list(by_id.values())


def _tasks_in_range_supabase(
    settings: Settings, from_ymd: str, to_ymd: str
) -> list[dict[str, Any]]:
    cli = tasks_repo._client(settings)
    d0, d1 = _parse_ymd(from_ymd), _parse_ymd(to_ymd)
    rows = cli.get_json(
        "/tasks",
        params={
            "select": _TASK_CALENDAR_SELECT,
            "and": f"(due_date.gte.{d0.isoformat()},due_date.lte.{d1.isoformat()})",
            "order": "due_date.asc.nullslast",
            "limit": "800",
        },
    )
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        d = tasks_repo._db_row_to_task_dict(row)
        if (d.get("업무명") or "").strip():
            out.append(d)
    return out


def _memos_in_range_supabase(
    settings: Settings, from_ymd: str, to_ymd: str
) -> list[MemoItem]:
    cli = memos_repo._client(settings)
    start_iso, end_iso = _ymd_bounds(from_ymd, to_ymd)
    rows = cli.get_json(
        "/memos",
        params={
            "select": "id,legacy_id,sheet_row,content,memo_at,memo_at_raw,category",
            "and": f"(memo_at.gte.{start_iso},memo_at.lte.{end_iso})",
            "order": "memo_at.desc",
            "limit": "200",
        },
    )
    if not isinstance(rows, list):
        return []
    out: list[MemoItem] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = memos_repo._row_to_memo_item(row)
        if item:
            out.append(item)
    return out


def _works_calendar_supabase(settings: Settings) -> list[dict[str, Any]]:
    rows = works_repo._client(settings).get_json(
        "/works",
        params={
            "select": "title,first_supply_schedule,extra",
            "order": "title.asc",
            "limit": "500",
        },
    )
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        title = str(r.get("title") or "").strip()
        if not title:
            continue
        rec: dict[str, Any] = {"작품명": title}
        fs = r.get("first_supply_schedule")
        if fs is not None:
            rec["첫 공급 일정"] = str(fs).strip() if str(fs).strip() else None
        extra = r.get("extra") or {}
        if isinstance(extra, dict):
            for k, v in extra.items():
                if k not in rec and v is not None and str(v).strip():
                    rec[str(k)] = str(v).strip()
        out.append(rec)
    return out


def _filter_upload_rows_client(
    rows: list[dict[str, Any]], from_ymd: str, to_ymd: str
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for d in rows:
        up = _norm_sheet_ymd(d.get("업로드일"))
        launch = _norm_sheet_ymd(d.get("런칭일"))
        if _in_range_ymd(up, from_ymd, to_ymd) or _in_range_ymd(launch, from_ymd, to_ymd):
            out.append(d)
    return out


def _filter_tasks_client(
    rows: list[dict[str, Any]], from_ymd: str, to_ymd: str
) -> list[dict[str, Any]]:
    return [
        d
        for d in rows
        if _in_range_ymd(_norm_sheet_ymd(d.get("마감일")), from_ymd, to_ymd)
    ]


def _filter_memos_client(items: list[MemoItem], from_ymd: str, to_ymd: str) -> list[MemoItem]:
    out: list[MemoItem] = []
    for m in items:
        ymd = _norm_sheet_ymd(m.memo_date)
        if _in_range_ymd(ymd, from_ymd, to_ymd):
            out.append(m)
    return out[:200]


def fetch_calendar_window(
    settings: Settings, from_ymd: str, to_ymd: str
) -> dict[str, Any]:
    """캘린더 표시 구간만 반환(업로드·업무·메모·작품 첫공급)."""
    if settings.data_backend == "supabase":
        # PostgREST range on due_date/upload_date alone drops rows that only have
        # *_raw sheet-style dates. Match control-room hub: load full lists, filter here.
        upload_rows = upload_rows_repo.list_upload_rows(settings)
        all_tasks = tasks_repo.list_tasks(settings)
        memo_items = memos_repo.list_memos(settings, limit=500)
        return {
            "uploadRows": _filter_upload_rows_client(upload_rows, from_ymd, to_ymd),
            "allTasks": _filter_tasks_client(all_tasks, from_ymd, to_ymd),
            "memos": _filter_memos_client(memo_items, from_ymd, to_ymd),
            "worksMaster": _works_calendar_supabase(settings),
        }
    upload_rows = fetch_upload_rows(settings)
    all_tasks = fetch_tasks(settings)
    memo_items = fetch_memos_from_google_sheets(settings)
    works = fetch_master_tab_keyed_rows(settings, settings.google_works_tab)
    return {
        "uploadRows": _filter_upload_rows_client(upload_rows, from_ymd, to_ymd),
        "allTasks": _filter_tasks_client(all_tasks, from_ymd, to_ymd),
        "memos": _filter_memos_client(memo_items, from_ymd, to_ymd),
        "worksMaster": works,
    }


def fetch_chatbot_context(settings: Settings) -> dict[str, Any]:
    """챗봇 질의용 제한된 컨텍스트(단일 응답)."""
    if settings.data_backend == "supabase":
        platform_master = platform_rows_repo.list_platform_master_slim(
            settings, limit=60
        )
        works_master = works_repo.list_works_master_slim(settings, limit=60)
        memos = memos_repo.list_memos(settings, limit=40, order_desc=True)
        tasks_raw = tasks_repo.list_tasks_limited(settings, limit=100)
        checklist = tasks_repo.fetch_checklist_from_supabase(settings)[:100]
        return {
            "platformMaster": platform_master,
            "worksMaster": works_master,
            "memos": memos,
            "tasks": tasks_raw,
            "checklist": [tasks_repo.checklist_item_to_payload(c) for c in checklist],
        }

    from services.google_checklist_sheets import fetch_checklist_for_briefing

    platform_master = fetch_master_tab_keyed_rows(settings, settings.google_platform_tab)[:60]
    works_master = fetch_master_tab_keyed_rows(settings, settings.google_works_tab)[:60]
    memo_items = fetch_memos_from_google_sheets(settings)[:40]
    tasks = fetch_tasks(settings)[:100]
    checklist_rows, _ = fetch_checklist_for_briefing(settings)
    checklist: list[ChecklistItem] = [c for c, _ in checklist_rows[:100]]
    return {
        "platformMaster": platform_master,
        "worksMaster": works_master,
        "memos": memo_items,
        "tasks": tasks,
        "checklist": [tasks_repo.checklist_item_to_payload(c) for c in checklist],
    }


def fetch_platform_matrix_bootstrap(settings: Settings) -> dict[str, Any]:
    if settings.data_backend == "supabase":
        return {
            "worksMaster": works_repo.list_works_master_for_matrix(settings),
            "platformMaster": platform_rows_repo.list_platform_master_slim(
                settings, limit=200
            ),
        }
    return {
        "worksMaster": fetch_master_tab_keyed_rows(settings, settings.google_works_tab),
        "platformMaster": fetch_master_tab_keyed_rows(
            settings, settings.google_platform_tab
        ),
    }


def calendar_range_for_month(year: int, month: int) -> tuple[str, str]:
    first = date(year, month, 1)
    if month == 12:
        last = date(year, 12, 31)
    else:
        last = date(year, month + 1, 1) - timedelta(days=1)
    pad_start = first - timedelta(days=7)
    pad_end = last + timedelta(days=7)
    return pad_start.isoformat(), pad_end.isoformat()
