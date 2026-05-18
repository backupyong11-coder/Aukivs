"""경량 hub API 라우트 스모크 테스트."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


class _MockSettings:
    data_backend = "supabase"


@pytest.fixture
def mock_settings():
    with patch("main.load_settings", return_value=_MockSettings()):
        yield


def test_hub_calendar_window(mock_settings):
    payload = {
        "uploadRows": [],
        "allTasks": [],
        "memos": [],
        "worksMaster": [],
    }
    with patch(
        "main.snapshot_repo.fetch_calendar_window",
        return_value=payload,
    ):
        r = client.get(
            "/hub/calendar-window",
            params={"from_ymd": "2026-05-01", "to_ymd": "2026-05-31"},
        )
    assert r.status_code == 200
    assert r.json() == payload


def test_hub_chatbot_context(mock_settings):
    payload = {
        "platformMaster": [],
        "worksMaster": [],
        "memos": [],
        "tasks": [],
        "checklist": [],
    }
    with patch(
        "main.snapshot_repo.fetch_chatbot_context",
        return_value=payload,
    ):
        r = client.get("/hub/chatbot-context")
    assert r.status_code == 200
    assert "platformMaster" in r.json()


def test_hub_platform_matrix_bootstrap(mock_settings):
    payload = {"worksMaster": [], "platformMaster": []}
    with patch(
        "main.snapshot_repo.fetch_platform_matrix_bootstrap",
        return_value=payload,
    ):
        r = client.get("/hub/platform-matrix-bootstrap")
    assert r.status_code == 200
    assert r.json() == payload


def test_platform_rows_lookup_route(mock_settings):
    with patch(
        "main.platform_rows_repo.list_platform_rows_lookup",
        return_value=[{"id": "x", "회사명": "TestCo", "플랫폼명": "PlatA"}],
    ):
        r = client.get("/platform-rows/lookup", params={"limit": 400})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 1


def test_memos_limit_query_param(mock_settings):
    with patch("main.list_memos_supabase", return_value=[]) as list_mock:
        r = client.get("/memos", params={"limit": 250})
    assert r.status_code == 200
    assert r.json() == []
    list_mock.assert_called_once()
    assert list_mock.call_args.kwargs.get("limit") == 250
