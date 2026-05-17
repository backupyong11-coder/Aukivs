"""PostgREST(Supabase) 공용 클라이언트. service_role 키는 로그에 남기지 않는다."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx


class SupabaseConfigurationError(RuntimeError):
    """SUPABASE_URL / 키 누락 등."""


class SupabaseRequestError(RuntimeError):
    """PostgREST HTTP 오류."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class SupabaseRestClient:
    """최소 PostgREST 래퍼(httpx)."""

    def __init__(self, url: str, service_role_key: str) -> None:
        base = (url or "").strip().rstrip("/")
        key = (service_role_key or "").strip()
        if not base or not key:
            raise SupabaseConfigurationError(
                "[설정] DATA_BACKEND=supabase 일 때 SUPABASE_URL 과 "
                "SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."
            )
        self._rest = f"{base}/rest/v1"
        self._headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """GET {path} (path는 / 포함 가능, rest/v1 기준 상대)."""
        with httpx.Client(timeout=60.0) as client:
            r = client.get(
                f"{self._rest}{path}",
                params=params,
                headers=self._headers,
            )
        if r.status_code >= 400:
            raise SupabaseRequestError(
                f"Supabase GET {path} failed HTTP {r.status_code}: {r.text[:500]}",
                status_code=r.status_code,
            )
        return r.json()

    def post_json(
        self,
        path: str,
        body: Any,
        *,
        prefer: str | None = None,
    ) -> Any:
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        with httpx.Client(timeout=60.0) as client:
            r = client.post(
                f"{self._rest}{path}",
                headers=headers,
                json=body,
            )
        if r.status_code >= 400:
            raise SupabaseRequestError(
                f"Supabase POST {path} failed HTTP {r.status_code}: {r.text[:500]}",
                status_code=r.status_code,
            )
        if r.content and r.headers.get("content-type", "").startswith("application/json"):
            try:
                return r.json()
            except Exception:
                return None
        return None

    def patch_json(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
        prefer: str | None = "return=minimal",
    ) -> None:
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        with httpx.Client(timeout=60.0) as client:
            r = client.patch(
                f"{self._rest}{path}",
                params=params or {},
                headers=headers,
                json=body or {},
            )
        if r.status_code >= 400:
            raise SupabaseRequestError(
                f"Supabase PATCH {path} failed HTTP {r.status_code}: {r.text[:500]}",
                status_code=r.status_code,
            )

    def delete_json(self, path: str, *, params: dict[str, Any] | None = None) -> None:
        headers = {**self._headers, "Prefer": "return=minimal"}
        with httpx.Client(timeout=60.0) as client:
            r = client.delete(
                f"{self._rest}{path}",
                params=params or {},
                headers=headers,
            )
        if r.status_code >= 400:
            raise SupabaseRequestError(
                f"Supabase DELETE {path} failed HTTP {r.status_code}: {r.text[:500]}",
                status_code=r.status_code,
            )


def rest_filter_equals(column: str, value: str | int) -> str:
    """PostgREST filter: col=eq.value (값은 인용 처리)."""
    if isinstance(value, int):
        return f"{column}=eq.{value}"
    return f"{column}=eq.{quote(str(value), safe='')}"

