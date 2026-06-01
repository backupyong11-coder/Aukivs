"""제작공정 대시보드: Supabase `public.production_process_documents` (단일 JSON 문서)."""

from __future__ import annotations

from typing import Any

from config import Settings
from services.supabase_client import SupabaseConfigurationError, SupabaseRestClient

DOCUMENT_ID = "default"


def _client(settings: Settings) -> SupabaseRestClient:
    url = (settings.supabase_url or "").strip()
    key = (settings.supabase_service_role_key or "").strip()
    return SupabaseRestClient(url, key)


def require_production_process_supabase(settings: Settings) -> None:
    if not (settings.supabase_url or "").strip() or not (
        settings.supabase_service_role_key or ""
    ).strip():
        raise SupabaseConfigurationError(
            "[설정] 제작공정 서버 저장에는 SUPABASE_URL 과 "
            "SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."
        )


def _validate_profile(profile: dict[str, Any]) -> None:
    if profile.get("version") != 1:
        raise ValueError("[파싱] production process profile version 은 1 이어야 합니다.")
    pipelines = profile.get("pipelines")
    if not isinstance(pipelines, list):
        raise ValueError("[파싱] pipelines 가 필요합니다.")
    for item in pipelines:
        if not isinstance(item, dict):
            raise ValueError("[파싱] pipelines 항목 형식이 올바르지 않습니다.")
        if not isinstance(item.get("name"), str):
            raise ValueError("[파싱] pipeline name 이 필요합니다.")
        steps = item.get("steps")
        if not isinstance(steps, list):
            raise ValueError("[파싱] pipeline steps 가 필요합니다.")


def get_profile(settings: Settings) -> dict[str, Any] | None:
    require_production_process_supabase(settings)
    cli = _client(settings)
    rows = cli.get_json(
        "/production_process_documents",
        params={
            "id": f"eq.{DOCUMENT_ID}",
            "select": "profile,updated_at",
            "limit": "1",
        },
    )
    if not isinstance(rows, list) or len(rows) == 0:
        return None
    row = rows[0]
    if not isinstance(row, dict):
        return None
    prof = row.get("profile")
    if not isinstance(prof, dict):
        return None
    _validate_profile(prof)
    return {
        "profile": prof,
        "updated_at": row.get("updated_at"),
    }


def upsert_profile(settings: Settings, profile: dict[str, Any]) -> str | None:
    require_production_process_supabase(settings)
    _validate_profile(profile)
    cli = _client(settings)
    body = {"id": DOCUMENT_ID, "profile": profile}
    result = cli.post_json(
        "/production_process_documents",
        body,
        prefer="resolution=merge-duplicates,return=representation",
    )
    if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
        ua = result[0].get("updated_at")
        return str(ua) if ua is not None else None
    return None
