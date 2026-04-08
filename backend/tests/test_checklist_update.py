import pytest
from fastapi.testclient import TestClient

import main as main_module


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_update_200_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, item_id, title, note):
        called["id"] = item_id
        called["title"] = title
        called["note"] = note

    monkeypatch.setattr(main_module, "update_checklist_item_in_sheet", fake)
    r = client.post(
        "/checklist/update",
        json={"id": "row-1", "title": "새 제목", "note": "메모"},
    )
    assert r.status_code == 200
    assert r.json() == {"updated": True}
    assert called == {"id": "row-1", "title": "새 제목", "note": "메모"}


def test_update_200_note_json_null(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, item_id, title, note):
        called["note"] = note

    monkeypatch.setattr(main_module, "update_checklist_item_in_sheet", fake)
    r = client.post(
        "/checklist/update",
        json={"id": "a", "title": "제목", "note": None},
    )
    assert r.status_code == 200
    assert called["note"] is None


def test_update_404_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    from services.sheets_errors import SheetsNotFoundError

    def fake(*_a, **_k):
        raise SheetsNotFoundError("[찾을수없음] 시트에 없거나 이미 완료된 id입니다: x")

    monkeypatch.setattr(main_module, "update_checklist_item_in_sheet", fake)
    r = client.post(
        "/checklist/update",
        json={"id": "x", "title": "t", "note": None},
    )
    assert r.status_code == 404
    assert "[찾을수없음]" in r.json().get("detail", "")


def test_update_422_empty_title(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "update_checklist_item_in_sheet", lambda *_a, **_k: None)
    r = client.post(
        "/checklist/update",
        json={"id": "a", "title": "   ", "note": None},
    )
    assert r.status_code == 422
