"""주간 회의록: Supabase `public.weekly_meeting_minutes` 1행/주.

매주 월요일을 키(week_start, YYYY-MM-DD)로 하는 회의록 문서.
- 단일 row = 단일 회의록
- attendees / decisions / action_items 등 구조화 필드는 JSON 으로 보관
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from config import Settings
from services.supabase_client import (
    SupabaseConfigurationError,
    SupabaseRequestError,
    SupabaseRestClient,
)
from services.sheets_errors import SheetsNotFoundError, SheetsParseError


_YMD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _client(settings: Settings) -> SupabaseRestClient:
    return SupabaseRestClient(
        settings.supabase_url or "",
        settings.supabase_service_role_key or "",
    )


def require_supabase(settings: Settings) -> None:
    if not (settings.supabase_url or "").strip() or not (
        settings.supabase_service_role_key or ""
    ).strip():
        raise SupabaseConfigurationError(
            "[설정] 주간 회의록 저장에는 SUPABASE_URL 과 "
            "SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."
        )


def _normalize_week_start(value: str) -> str:
    s = (value or "").strip()
    if not _YMD_RE.match(s):
        raise SheetsParseError("[파싱] week_start는 YYYY-MM-DD 형식이어야 합니다.")
    dt = datetime.fromisoformat(s).date()
    # 월요일로 정규화
    delta = dt.weekday()
    if delta != 0:
        from datetime import timedelta
        dt = dt - timedelta(days=delta)
    return dt.isoformat()


def _str_or_none(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _list_of_str(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str):
        return [p.strip() for p in v.split(",") if p.strip()]
    return []


def _normalize_payload(body: dict[str, Any]) -> dict[str, Any]:
    week_start = _normalize_week_start(str(body.get("week_start", "")))
    title = _str_or_none(body.get("title")) or f"{week_start} 주간 회의록"
    content = _str_or_none(body.get("content")) or ""
    attendees = _list_of_str(body.get("attendees"))
    decisions = _list_of_str(body.get("decisions"))
    action_items = body.get("action_items") or []
    if not isinstance(action_items, list):
        action_items = []
    cleaned_actions: list[dict[str, Any]] = []
    for it in action_items:
        if not isinstance(it, dict):
            continue
        text = _str_or_none(it.get("text"))
        if not text:
            continue
        cleaned_actions.append(
            {
                "text": text,
                "owner": _str_or_none(it.get("owner")) or "",
                "due": _str_or_none(it.get("due")) or "",
                "done": bool(it.get("done")),
            }
        )
    status = _str_or_none(body.get("status")) or "draft"
    tags = _list_of_str(body.get("tags"))
    return {
        "week_start": week_start,
        "title": title,
        "content": content,
        "attendees": attendees,
        "decisions": decisions,
        "action_items": cleaned_actions,
        "status": status,
        "tags": tags,
    }


def _row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "week_start": str(row.get("week_start") or ""),
        "title": str(row.get("title") or ""),
        "content": str(row.get("content") or ""),
        "attendees": row.get("attendees") or [],
        "decisions": row.get("decisions") or [],
        "action_items": row.get("action_items") or [],
        "status": str(row.get("status") or "draft"),
        "tags": row.get("tags") or [],
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


_SELECT = (
    "week_start,title,content,attendees,decisions,action_items,status,tags,"
    "created_at,updated_at"
)


def list_minutes(
    settings: Settings,
    *,
    from_ymd: str | None = None,
    to_ymd: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    require_supabase(settings)
    cli = _client(settings)
    params: dict[str, str] = {
        "select": _SELECT,
        "order": "week_start.desc",
        "limit": str(max(1, int(limit))),
    }
    if from_ymd:
        params["week_start"] = f"gte.{_normalize_week_start(from_ymd)}"
    if to_ymd:
        params.setdefault("week_start", "")
        norm_to = _normalize_week_start(to_ymd)
        if params["week_start"]:
            params["week_start"] = f"and({params['week_start']},lte.{norm_to})"
        else:
            params["week_start"] = f"lte.{norm_to}"
    try:
        rows = cli.get_json("/weekly_meeting_minutes", params=params)
    except SupabaseRequestError as exc:
        msg = str(exc).lower()
        if exc.status_code == 404 or "could not find" in msg or "pgrst204" in msg:
            return []
        raise
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for r in rows:
        if isinstance(r, dict):
            out.append(_row_to_dict(r))
    return out


def get_minutes(settings: Settings, week_start: str) -> dict[str, Any] | None:
    require_supabase(settings)
    ws = _normalize_week_start(week_start)
    cli = _client(settings)
    try:
        rows = cli.get_json(
            "/weekly_meeting_minutes",
            params={"select": _SELECT, "week_start": f"eq.{ws}", "limit": "1"},
        )
    except SupabaseRequestError as exc:
        if exc.status_code == 404:
            return None
        raise
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return _row_to_dict(rows[0])
    return None


def upsert_minutes(settings: Settings, body: dict[str, Any]) -> dict[str, Any]:
    require_supabase(settings)
    payload = _normalize_payload(body)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    cli = _client(settings)
    rows = cli.post_json(
        "/weekly_meeting_minutes",
        payload,
        prefer="resolution=merge-duplicates,return=representation",
    )
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return _row_to_dict(rows[0])
    got = get_minutes(settings, payload["week_start"])
    if got is None:
        raise SheetsParseError("Supabase weekly_meeting_minutes upsert 응답 없음")
    return got


def delete_minutes(settings: Settings, week_start: str) -> None:
    require_supabase(settings)
    ws = _normalize_week_start(week_start)
    cli = _client(settings)
    try:
        cli.delete_json(
            "/weekly_meeting_minutes",
            params={"week_start": f"eq.{ws}"},
        )
    except SupabaseRequestError as exc:
        if exc.status_code == 404:
            raise SheetsNotFoundError(f"[찾을수없음] 회의록 없음: {ws}") from exc
        raise
