import pytest
from fastapi.testclient import TestClient

import main as main_module


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_complete_200_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def fake(_settings, ids: list[str]) -> int:
        assert ids == ["a", "b"]
        return 2

    monkeypatch.setattr(main_module, "complete_checklist_items_by_ids", fake)
    r = client.post("/checklist/complete", json={"ids": ["a", "b"]})
    assert r.status_code == 200
    assert r.json() == {"completed": 2}


def test_complete_404_not_found(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    from services.sheets_errors import SheetsNotFoundError

    def fake(_settings, _ids):
        raise SheetsNotFoundError("[찾을수없음] 시트에 없는 id: ghost")

    monkeypatch.setattr(main_module, "complete_checklist_items_by_ids", fake)
    r = client.post("/checklist/complete", json={"ids": ["ghost"]})
    assert r.status_code == 404
    assert "[찾을수없음]" in r.json().get("detail", "")


def test_complete_422_empty_ids(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "complete_checklist_items_by_ids", lambda *_a, **_k: 0)
    r = client.post("/checklist/complete", json={"ids": []})
    assert r.status_code == 422


def test_complete_422_blank_ids(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "complete_checklist_items_by_ids", lambda *_a, **_k: 0)
    r = client.post("/checklist/complete", json={"ids": ["", "  "]})
    assert r.status_code == 422
