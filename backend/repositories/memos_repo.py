"""메모: DATA_BACKEND=supabase 일 때 PostgREST `public.memos` 접근."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from config import Settings
from schemas import MemoItem
from services.supabase_client import (
    SupabaseConfigurationError,
    SupabaseRestClient,
)

_KST = ZoneInfo("Asia/Seoul")
_LEGACY_ROW_RE = re.compile(r"^memo-row-(\d+)$")


def _client(settings: Settings) -> SupabaseRestClient:
    url = (settings.supabase_url or "").strip()
    key = (settings.supabase_service_role_key or "").strip()
    return SupabaseRestClient(url, key)


def _memo_timestamp_seoul() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%d %H:%M:%S")


def _iso_memo_at() -> str:
    return datetime.now(_KST).replace(microsecond=0).isoformat()


def _memo_date_display(row: dict[str, Any]) -> str:
    raw = row.get("memo_at_raw")
    if raw is not None and str(raw).strip():
        return str(raw).strip()
    ma = row.get("memo_at")
    if not ma:
        return ""
    try:
        s = str(ma).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_KST)
        return dt.astimezone(_KST).strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return str(ma)


def _sheet_row_for_item(row: dict[str, Any]) -> int:
    sr = row.get("sheet_row")
    if isinstance(sr, int) and sr >= 2:
        return sr
    lid = row.get("legacy_id")
    if lid is not None:
        m = _LEGACY_ROW_RE.match(str(lid).strip())
        if m:
            return max(2, int(m.group(1)))
    sid = row.get("id")
    if sid:
        return max(2, hash(str(sid)) % 9_000_000 + 2)
    return 2


def _row_to_memo_item(row: dict[str, Any]) -> MemoItem | None:
    content = str(row.get("content") or "").strip()
    if not content:
        return None
    mid = row.get("id")
    id_str = str(mid).strip() if mid else None
    return MemoItem(
        sheet_row=_sheet_row_for_item(row),
        content=content,
        memo_date=_memo_date_display(row),
        category=(
            None
            if row.get("category") is None or str(row["category"]).strip() == ""
            else str(row["category"]).strip()
        ),
        legacy_id=str(row["legacy_id"]).strip() if row.get("legacy_id") else None,
        id=id_str,
    )


def list_memos(
    settings: Settings,
    *,
    limit: int | None = 250,
    order_desc: bool = True,
) -> list[MemoItem]:
    cli = _client(settings)
    order = "memo_at.desc,sheet_row.desc" if order_desc else "sheet_row.asc"
    params: dict[str, str] = {
        "select": "id,legacy_id,sheet_row,content,memo_at,memo_at_raw,category",
        "order": order,
    }
    if limit is not None and limit > 0:
        params["limit"] = str(int(limit))
    rows = cli.get_json(
        "/memos",
        params=params,
    )
    if not isinstance(rows, list):
        return []
    out: list[MemoItem] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = _row_to_memo_item(row)
        if item:
            out.append(item)
    return out


def _next_sheet_row(cli: SupabaseRestClient) -> int:
    got = cli.get_json(
        "/memos",
        params={
            "select": "sheet_row",
            "sheet_row": "not.is.null",
            "order": "sheet_row.desc.nullslast",
            "limit": "1",
        },
    )
    if isinstance(got, list) and got and isinstance(got[0], dict):
        m = got[0].get("sheet_row")
        if isinstance(m, int) and m >= 2:
            return m + 1
    return 2


def create_memo(settings: Settings, content: str, category: str | None) -> None:
    text = content.strip()
    if not text:
        raise ValueError("[파싱] 메모 내용이 비어 있습니다.")
    cli = _client(settings)
    sheet_row = _next_sheet_row(cli)
    legacy_id = f"memo-api-{uuid4()}"
    ts_display = _memo_timestamp_seoul()
    body = [
        {
            "legacy_id": legacy_id,
            "sheet_row": sheet_row,
            "content": text,
            "memo_at": _iso_memo_at(),
            "memo_at_raw": ts_display,
            "category": (category or "").strip() or None,
        }
    ]
    cli.post_json("/memos", body, prefer="return=minimal")


def update_memo(
    settings: Settings,
    *,
    memo_id: str | None,
    sheet_row: int,
    content: str,
    category: str | None,
) -> None:
    text = content.strip()
    if not text:
        raise ValueError("[파싱] 메모 내용이 비어 있습니다.")
    cli = _client(settings)
    ts_display = _memo_timestamp_seoul()
    body: dict[str, Any] = {
        "content": text,
        "category": (category or "").strip() or None,
        "memo_at": _iso_memo_at(),
        "memo_at_raw": ts_display,
    }
    oid = (memo_id or "").strip()
    if oid:
        cli.patch_json("/memos", params={"id": f"eq.{oid}"}, body=body)
        return
    if sheet_row < 2:
        raise ValueError("[파싱] 메모 행 번호가 올바르지 않습니다.")
    cli.patch_json("/memos", params={"sheet_row": f"eq.{sheet_row}"}, body=body)


def delete_memo(settings: Settings, *, memo_id: str | None, sheet_row: int) -> None:
    cli = _client(settings)
    oid = (memo_id or "").strip()
    if oid:
        cli.delete_json("/memos", params={"id": f"eq.{oid}"})
        return
    if sheet_row < 2:
        raise ValueError("[파싱] 메모 행 번호가 올바르지 않습니다.")
    cli.delete_json("/memos", params={"sheet_row": f"eq.{sheet_row}"})


def resolve_memos_config(settings: Settings) -> None:
    """DATA_BACKEND=supabase 인데 설정이 없으면 명확히 실패."""
    if (settings.data_backend or "").strip().lower() != "supabase":
        return
    if not (settings.supabase_url or "").strip() or not (
        settings.supabase_service_role_key or ""
    ).strip():
        raise SupabaseConfigurationError(
            "[설정] DATA_BACKEND=supabase 일 때 SUPABASE_URL 과 "
            "SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."
        )
