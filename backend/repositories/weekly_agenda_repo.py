"""주간 아젠다: Supabase `public.weekly_agenda_documents` (단일 JSON 문서)."""

from __future__ import annotations

from typing import Any

from config import Settings
from services.supabase_client import (
    SupabaseConfigurationError,
    SupabaseRestClient,
)

DOCUMENT_ID = "default"


def _client(settings: Settings) -> SupabaseRestClient:
    url = (settings.supabase_url or "").strip()
    key = (settings.supabase_service_role_key or "").strip()
    return SupabaseRestClient(url, key)


def require_weekly_agenda_supabase(settings: Settings) -> None:
    if not (settings.supabase_url or "").strip() or not (
        settings.supabase_service_role_key or ""
    ).strip():
        raise SupabaseConfigurationError(
            "[설정] 주간 아젠다 서버 저장에는 SUPABASE_URL 과 "
            "SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."
        )


def _validate_workbook(workbook: dict[str, Any]) -> None:
    if workbook.get("version") != 2:
        raise ValueError("[파싱] 주간 아젠다 workbook version 은 2 여야 합니다.")
    if not isinstance(workbook.get("activeSheetId"), str) or not workbook["activeSheetId"].strip():
        raise ValueError("[파싱] activeSheetId 가 비어 있습니다.")
    sheets = workbook.get("sheets")
    if not isinstance(sheets, list) or len(sheets) == 0:
        raise ValueError("[파싱] sheets 가 비어 있습니다.")
    for item in sheets:
        if not isinstance(item, dict):
            raise ValueError("[파싱] sheets 항목 형식이 올바르지 않습니다.")
        st = item.get("state")
        if not isinstance(st, dict) or st.get("version") != 1:
            raise ValueError("[파싱] 시트 state.version 이 1 이어야 합니다.")
        if not isinstance(st.get("majors"), list) or not isinstance(st.get("rows"), list):
            raise ValueError("[파싱] 시트 state.majors/rows 가 필요합니다.")


def get_workbook(settings: Settings) -> dict[str, Any] | None:
    """저장된 워크북 JSON 또는 없으면 None."""
    require_weekly_agenda_supabase(settings)
    cli = _client(settings)
    rows = cli.get_json(
        "/weekly_agenda_documents",
        params={
            "id": f"eq.{DOCUMENT_ID}",
            "select": "workbook,updated_at",
            "limit": "1",
        },
    )
    if not isinstance(rows, list) or len(rows) == 0:
        return None
    row = rows[0]
    if not isinstance(row, dict):
        return None
    wb = row.get("workbook")
    if not isinstance(wb, dict):
        return None
    _validate_workbook(wb)
    return {
        "workbook": wb,
        "updated_at": row.get("updated_at"),
    }


def upsert_workbook(settings: Settings, workbook: dict[str, Any]) -> str | None:
    """워크북 저장(upsert). 반환: updated_at ISO 문자열(가능 시)."""
    require_weekly_agenda_supabase(settings)
    _validate_workbook(workbook)
    cli = _client(settings)
    body = {"id": DOCUMENT_ID, "workbook": workbook}
    result = cli.post_json(
        "/weekly_agenda_documents",
        body,
        prefer="resolution=merge-duplicates,return=representation",
    )
    if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
        ua = result[0].get("updated_at")
        return str(ua) if ua is not None else None
    existing = get_workbook(settings)
    if existing:
        ua = existing.get("updated_at")
        return str(ua) if ua is not None else None
    return None
