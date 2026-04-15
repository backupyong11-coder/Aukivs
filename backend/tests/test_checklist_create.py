import pytest
from fastapi.testclient import TestClient

import main as main_module
from schemas import ChecklistItem
from services.sheets_errors import SheetsConfigurationError, SheetsFetchError


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_create_200_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, title, note):
        called["title"] = title
        called["note"] = note
        return ChecklistItem(id="sheet-row-99", title=title, note=None, due_date=None)

    monkeypatch.setattr(main_module, "create_checklist_item_in_sheet", fake)
    r = client.post(
        "/checklist/create",
        json={"title": "새 할 일", "note": "메모"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "sheet-row-99"
    assert data["title"] == "새 할 일"
    assert data["note"] is None
    assert data["due_date"] is None
    assert called == {"title": "새 할 일", "note": "메모"}


def test_create_200_note_null(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, title, note):
        called["note"] = note
        return ChecklistItem(id="u2", title=title, note=None, due_date=None)

    monkeypatch.setattr(main_module, "create_checklist_item_in_sheet", fake)
    r = client.post("/checklist/create", json={"title": "제목만", "note": None})
    assert r.status_code == 200
    assert r.json()["note"] is None
    assert r.json().get("due_date") is None
    assert called["note"] is None


def test_create_422_empty_title(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(
        main_module,
        "create_checklist_item_in_sheet",
        lambda *_a, **_k: ChecklistItem(id="x", title="x", note=None, due_date=None),
    )
    r = client.post("/checklist/create", json={"title": "   "})
    assert r.status_code == 422


def test_create_503_config(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)
    monkeypatch.delenv("GOOGLE_SHEET_URL", raising=False)

    def boom(*_a, **_k):
        raise SheetsConfigurationError("[설정] 테스트")

    monkeypatch.setattr(main_module, "create_checklist_item_in_sheet", boom)
    r = client.post("/checklist/create", json={"title": "a"})
    assert r.status_code == 503
    assert "[설정]" in r.json().get("detail", "")


def test_create_502_sheets_api(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def boom(*_a, **_k):
        raise SheetsFetchError("[Sheets API] HTTP 500: x")

    monkeypatch.setattr(main_module, "create_checklist_item_in_sheet", boom)
    r = client.post("/checklist/create", json={"title": "a"})
    assert r.status_code == 502
    assert "[Sheets API]" in r.json().get("detail", "")


def test_create_response_shape_sheet_row_id(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def fake(settings, title, note):
        return ChecklistItem(
            id="sheet-row-12",
            title=title,
            note=None,
            due_date=None,
        )

    monkeypatch.setattr(main_module, "create_checklist_item_in_sheet", fake)
    r = client.post(
        "/checklist/create",
        json={"title": "검증", "note": "n"},
    )
    assert r.status_code == 200
    j = r.json()
    assert j["title"] == "검증"
    assert j["note"] is None
    assert j["id"] == "sheet-row-12"
    assert j.get("due_date") is None
