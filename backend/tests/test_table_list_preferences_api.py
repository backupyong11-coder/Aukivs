"""정리 표 열 너비 API — Supabase 모킹."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_get_column_widths_empty(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    import main as main_module

    monkeypatch.setattr(
        main_module.table_list_prefs_repo,
        "get_column_widths",
        lambda _s, _p: {},
    )
    r = client.get("/table-list-preferences/tasks")
    assert r.status_code == 200
    assert r.json()["column_widths"] == {}


def test_put_column_widths_ok(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    import main as main_module

    def fake_upsert(_settings, page_id, widths):
        assert page_id == "tasks"
        assert widths["업무명"] == 180
        return "2026-05-27T12:00:00+09:00"

    monkeypatch.setattr(
        main_module.table_list_prefs_repo,
        "upsert_column_widths",
        fake_upsert,
    )
    r = client.put(
        "/table-list-preferences/tasks",
        json={"column_widths": {"업무명": 180}},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_put_invalid_page_id(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    import main as main_module

    def raise_val(_s, page_id, _w):
        raise ValueError(f"[파싱] 알 수 없는 page_id: {page_id}")

    monkeypatch.setattr(
        main_module.table_list_prefs_repo,
        "upsert_column_widths",
        raise_val,
    )
    r = client.put(
        "/table-list-preferences/unknown",
        json={"column_widths": {"a": 100}},
    )
    assert r.status_code == 400
