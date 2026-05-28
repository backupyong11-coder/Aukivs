"""정리 표 UI 설정 — Supabase `public.table_list_preferences` (공유 단일 문서)."""

from __future__ import annotations

from typing import Any

from config import Settings
from services.supabase_client import SupabaseConfigurationError, SupabaseRestClient

DOCUMENT_ID = "default"

VALID_PAGE_IDS: frozenset[str] = frozenset(
    {
        "announcement-date",
        "progress",
        "launching",
        "contracts",
        "tasks",
        "upload-rows",
        "platforms",
        "platform-matrix",
    }
)

MIN_WIDTH = 56
MAX_WIDTH = 560


def _client(settings: Settings) -> SupabaseRestClient:
    url = (settings.supabase_url or "").strip()
    key = (settings.supabase_service_role_key or "").strip()
    return SupabaseRestClient(url, key)


def require_supabase(settings: Settings) -> None:
    if not (settings.supabase_url or "").strip() or not (
        settings.supabase_service_role_key or ""
    ).strip():
        raise SupabaseConfigurationError(
            "[설정] 정리 표 UI 저장에는 SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."
        )


def validate_page_id(page_id: str) -> str:
    pid = (page_id or "").strip()
    if pid not in VALID_PAGE_IDS:
        raise ValueError(f"[파싱] 알 수 없는 page_id: {page_id}")
    return pid


def _sanitize_widths(raw: dict[str, Any]) -> dict[str, int]:
    out: dict[str, int] = {}
    for k, v in raw.items():
        if not isinstance(k, str) or not k.strip():
            continue
        if isinstance(v, bool):
            continue
        try:
            n = int(round(float(v)))
        except (TypeError, ValueError):
            continue
        out[k] = max(MIN_WIDTH, min(MAX_WIDTH, n))
    return out


def _sanitize_label_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        label = item.strip()
        if not label or label in seen:
            continue
        seen.add(label)
        out.append(label)
    return out


def _load_preferences_doc(settings: Settings) -> dict[str, Any]:
    require_supabase(settings)
    cli = _client(settings)
    rows = cli.get_json(
        "/table_list_preferences",
        params={
            "id": f"eq.{DOCUMENT_ID}",
            "select": "preferences,updated_at",
            "limit": "1",
        },
    )
    if not isinstance(rows, list) or len(rows) == 0:
        return {}
    row = rows[0]
    if not isinstance(row, dict):
        return {}
    prefs = row.get("preferences")
    return prefs if isinstance(prefs, dict) else {}


def get_column_widths(settings: Settings, page_id: str) -> dict[str, int]:
    pid = validate_page_id(page_id)
    prefs = _load_preferences_doc(settings)
    page = prefs.get(pid)
    if not isinstance(page, dict):
        return {}
    cw = page.get("columnWidths")
    if not isinstance(cw, dict):
        return {}
    return _sanitize_widths(cw)


def upsert_column_widths(
    settings: Settings, page_id: str, column_widths: dict[str, Any]
) -> str | None:
    pid = validate_page_id(page_id)
    sanitized = _sanitize_widths(column_widths)
    require_supabase(settings)
    prefs = _load_preferences_doc(settings)
    page = prefs.get(pid)
    if not isinstance(page, dict):
        page = {}
    page["columnWidths"] = sanitized
    prefs[pid] = page

    cli = _client(settings)
    body = {"id": DOCUMENT_ID, "preferences": prefs}
    result = cli.post_json(
        "/table_list_preferences",
        body,
        prefer="resolution=merge-duplicates,return=representation",
    )
    if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
        ua = result[0].get("updated_at")
        return str(ua) if ua is not None else None
    return None


def get_platform_matrix_preferences(settings: Settings) -> dict[str, list[str]]:
    prefs = _load_preferences_doc(settings)
    page = prefs.get("platform-matrix")
    if not isinstance(page, dict):
        return {"column_order": [], "hidden_columns": [], "row_order": []}
    return {
        "column_order": _sanitize_label_list(page.get("columnOrder")),
        "hidden_columns": _sanitize_label_list(page.get("hiddenColumns")),
        "row_order": _sanitize_label_list(page.get("rowOrder")),
    }


def upsert_platform_matrix_preferences(
    settings: Settings,
    *,
    column_order: list[Any],
    hidden_columns: list[Any],
    row_order: list[Any],
) -> str | None:
    require_supabase(settings)
    prefs = _load_preferences_doc(settings)
    page = prefs.get("platform-matrix")
    if not isinstance(page, dict):
        page = {}
    page["columnOrder"] = _sanitize_label_list(column_order)
    page["hiddenColumns"] = _sanitize_label_list(hidden_columns)
    page["rowOrder"] = _sanitize_label_list(row_order)
    prefs["platform-matrix"] = page

    cli = _client(settings)
    body = {"id": DOCUMENT_ID, "preferences": prefs}
    result = cli.post_json(
        "/table_list_preferences",
        body,
        prefer="resolution=merge-duplicates,return=representation",
    )
    if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
        ua = result[0].get("updated_at")
        return str(ua) if ua is not None else None
    return None
