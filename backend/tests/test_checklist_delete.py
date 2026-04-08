import pytest
from fastapi.testclient import TestClient

import main as main_module


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_delete_200_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, item_id):
        called["id"] = item_id

    monkeypatch.setattr(main_module, "delete_checklist_row_by_id", fake)
    r = client.post("/checklist/delete", json={"id": "row-1"})
    assert r.status_code == 200
    assert r.json() == {"deleted": True}
    assert called == {"id": "row-1"}


def test_delete_404_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    from services.sheets_errors import SheetsNotFoundError

    def fake(*_a, **_k):
        raise SheetsNotFoundError("[찾을수없음] 목록에 없거나 이미 완료된 id입니다: x")

    monkeypatch.setattr(main_module, "delete_checklist_row_by_id", fake)
    r = client.post("/checklist/delete", json={"id": "x"})
    assert r.status_code == 404
    assert "[찾을수없음]" in r.json().get("detail", "")


def test_delete_422_empty_id(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "delete_checklist_row_by_id", lambda *_a, **_k: None)
    r = client.post("/checklist/delete", json={"id": "   "})
    assert r.status_code == 422
