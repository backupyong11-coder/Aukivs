import pytest
from fastapi.testclient import TestClient

import main as main_module


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_uploads_update_200_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, item_id, fields):
        called["id"] = item_id
        called["fields"] = fields

    monkeypatch.setattr(main_module, "update_upload_item_in_sheet", fake)
    r = client.post(
        "/uploads/update",
        json={
            "id": "u1",
            "status": "검수중",
            "note": "메모",
            "uploaded_at": "2026-04-02T10:00:00+09:00",
        },
    )
    assert r.status_code == 200
    assert r.json() == {"updated": True}
    assert called["id"] == "u1"
    assert called["fields"] == {
        "status": "검수중",
        "note": "메모",
        "uploaded_at": "2026-04-02T10:00:00+09:00",
    }


def test_uploads_update_partial_fields_only(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, item_id, fields):
        called["fields"] = fields

    monkeypatch.setattr(main_module, "update_upload_item_in_sheet", fake)
    r = client.post(
        "/uploads/update",
        json={"id": "u1", "status": "완료"},
    )
    assert r.status_code == 200
    assert called["fields"] == {"status": "완료"}


def test_uploads_update_null_clears_note_and_status(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, item_id, fields):
        called["fields"] = fields

    monkeypatch.setattr(main_module, "update_upload_item_in_sheet", fake)
    r = client.post(
        "/uploads/update",
        json={"id": "u1", "note": None, "status": None},
    )
    assert r.status_code == 200
    assert called["fields"] == {"note": None, "status": None}


def test_uploads_update_404_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    from services.sheets_errors import SheetsNotFoundError

    def fake(*_a, **_k):
        raise SheetsNotFoundError("[찾을수없음] 업로드 목록에 없는 id입니다: x")

    monkeypatch.setattr(main_module, "update_upload_item_in_sheet", fake)
    r = client.post("/uploads/update", json={"id": "x", "note": "a"})
    assert r.status_code == 404
    assert "[찾을수없음]" in r.json().get("detail", "")


def test_uploads_update_422_no_fields(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "update_upload_item_in_sheet", lambda *_a, **_k: None)
    r = client.post("/uploads/update", json={"id": "u1"})
    assert r.status_code == 422


def test_uploads_update_422_empty_id(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "update_upload_item_in_sheet", lambda *_a, **_k: None)
    r = client.post("/uploads/update", json={"id": "   ", "note": "x"})
    assert r.status_code == 422


def test_uploads_update_422_uploaded_at_empty_when_sent(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "update_upload_item_in_sheet", lambda *_a, **_k: None)
    r = client.post(
        "/uploads/update",
        json={"id": "u1", "uploaded_at": ""},
    )
    assert r.status_code == 422


def test_uploads_update_422_extra_field(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "update_upload_item_in_sheet", lambda *_a, **_k: None)
    r = client.post(
        "/uploads/update",
        json={"id": "u1", "note": "a", "title": "hack"},
    )
    assert r.status_code == 422
