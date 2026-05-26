"""주간 아젠다 API — Supabase 저장소 모킹."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

SAMPLE_WORKBOOK = {
    "version": 2,
    "activeSheetId": "sheet-1",
    "sheets": [
        {
            "id": "sheet-1",
            "label": "테스트",
            "order": 0,
            "state": {
                "version": 1,
                "title": "Weekly Agenda",
                "majors": [{"id": "m1", "name": "제작", "order": 0}],
                "minorPresets": [],
                "rows": [],
                "personGrid": {"title": "인물별 주간", "rows": []},
            },
        },
    ],
}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_weekly_agenda_get_empty(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    def fake_get(_settings):
        return None

    import main as main_module

    monkeypatch.setattr(main_module.weekly_agenda_repo, "get_workbook", fake_get)
    r = client.get("/weekly-agenda")
    assert r.status_code == 200
    assert r.json() == {"workbook": None, "updated_at": None}


def test_weekly_agenda_put_ok(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    def fake_upsert(_settings, workbook):
        assert workbook["version"] == 2
        return "2026-05-20T12:00:00+09:00"

    import main as main_module

    monkeypatch.setattr(main_module.weekly_agenda_repo, "upsert_workbook", fake_upsert)
    r = client.put("/weekly-agenda", json={"workbook": SAMPLE_WORKBOOK})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_weekly_agenda_put_400_invalid_workbook(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    import main as main_module

    def bad_upsert(_settings, _workbook):
        raise ValueError("[파싱] 주간 아젠다 workbook version 은 2 여야 합니다.")

    monkeypatch.setattr(main_module.weekly_agenda_repo, "upsert_workbook", bad_upsert)
    r = client.put("/weekly-agenda", json={"workbook": {"version": 1}})
    assert r.status_code == 400


def test_weekly_agenda_503_without_supabase(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    r = client.get("/weekly-agenda")
    assert r.status_code == 503
    assert "SUPABASE" in r.json().get("detail", "")
