import pytest
from fastapi.testclient import TestClient

import main as main_module
from services.sheets_errors import (
    SheetsConfigurationError,
    SheetsFetchError,
    SheetsParseError,
)


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_uploads_delete_200_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, item_id):
        called["id"] = item_id

    monkeypatch.setattr(main_module, "delete_upload_row_by_id", fake)
    r = client.post("/uploads/delete", json={"id": "u-1"})
    assert r.status_code == 200
    assert r.json() == {"deleted": True}
    assert called == {"id": "u-1"}


def test_uploads_delete_404_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    from services.sheets_errors import SheetsNotFoundError

    def fake(*_a, **_k):
        raise SheetsNotFoundError("[찾을수없음] 업로드 목록에 없는 id입니다: x")

    monkeypatch.setattr(main_module, "delete_upload_row_by_id", fake)
    r = client.post("/uploads/delete", json={"id": "x"})
    assert r.status_code == 404
    assert "[찾을수없음]" in r.json().get("detail", "")


def test_uploads_delete_422_empty_id(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "delete_upload_row_by_id", lambda *_a, **_k: None)
    r = client.post("/uploads/delete", json={"id": "   "})
    assert r.status_code == 422


def test_uploads_delete_422_missing_id(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(main_module, "delete_upload_row_by_id", lambda *_a, **_k: None)
    r = client.post("/uploads/delete", json={})
    assert r.status_code == 422


def test_uploads_delete_503_config(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def boom(*_a, **_k):
        raise SheetsConfigurationError("[설정] 테스트")

    monkeypatch.setattr(main_module, "delete_upload_row_by_id", boom)
    r = client.post("/uploads/delete", json={"id": "a"})
    assert r.status_code == 503
    assert "[설정]" in r.json().get("detail", "")


def test_uploads_delete_502_sheets_api(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def boom(*_a, **_k):
        raise SheetsFetchError("[Sheets API] HTTP 500: x")

    monkeypatch.setattr(main_module, "delete_upload_row_by_id", boom)
    r = client.post("/uploads/delete", json={"id": "a"})
    assert r.status_code == 502
    assert "[Sheets API]" in r.json().get("detail", "")


def test_uploads_delete_400_parse(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def boom(*_a, **_k):
        raise SheetsParseError("[파싱] 3행: title은 있으나 file_name(열 C)이 비어 있습니다.")

    monkeypatch.setattr(main_module, "delete_upload_row_by_id", boom)
    r = client.post("/uploads/delete", json={"id": "a"})
    assert r.status_code == 400
    assert "[파싱]" in r.json().get("detail", "")
