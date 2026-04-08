import pytest
from fastapi.testclient import TestClient

import main as main_module
from schemas import UploadItem
from services.sheets_errors import SheetsConfigurationError, SheetsFetchError


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_uploads_create_200_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, *, title, file_name, uploaded_at, note, status):
        called["title"] = title
        called["file_name"] = file_name
        called["uploaded_at"] = uploaded_at
        called["note"] = note
        called["status"] = status
        return UploadItem(
            id="550e8400-e29b-41d4-a716-446655440000",
            title=title,
            file_name="f.pdf",
            uploaded_at="2026-04-02T10:00:00+09:00",
            note=note,
            status=status,
        )

    monkeypatch.setattr(main_module, "create_upload_item_in_sheet", fake)
    r = client.post(
        "/uploads/create",
        json={
            "title": "신규",
            "file_name": "f.pdf",
            "uploaded_at": "2026-04-02T10:00:00+09:00",
            "note": "n",
            "status": "대기",
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert j["id"] == "550e8400-e29b-41d4-a716-446655440000"
    assert j["title"] == "신규"
    assert j["file_name"] == "f.pdf"
    assert j["uploaded_at"] == "2026-04-02T10:00:00+09:00"
    assert j["note"] == "n"
    assert j["status"] == "대기"
    assert called["title"] == "신규"
    assert called["file_name"] == "f.pdf"
    assert called["uploaded_at"] == "2026-04-02T10:00:00+09:00"
    assert called["note"] == "n"
    assert called["status"] == "대기"


def test_uploads_create_200_title_only(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, *, title, file_name, uploaded_at, note, status):
        called["kwargs"] = {
            "title": title,
            "file_name": file_name,
            "uploaded_at": uploaded_at,
            "note": note,
            "status": status,
        }
        return UploadItem(
            id="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
            title=title,
            file_name="(파일명 미입력)",
            uploaded_at="2026-04-04T12:00:00+09:00",
            note=None,
            status=None,
        )

    monkeypatch.setattr(main_module, "create_upload_item_in_sheet", fake)
    r = client.post("/uploads/create", json={"title": "제목만"})
    assert r.status_code == 200
    j = r.json()
    assert j["title"] == "제목만"
    assert j["note"] is None
    assert j["status"] is None
    assert called["kwargs"] == {
        "title": "제목만",
        "file_name": None,
        "uploaded_at": None,
        "note": None,
        "status": None,
    }


def test_uploads_create_note_status_null_and_blank(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    called: dict = {}

    def fake(settings, *, title, file_name, uploaded_at, note, status):
        called["note"] = note
        called["status"] = status
        return UploadItem(
            id="b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
            title=title,
            file_name="x",
            uploaded_at="+09:00",
            note=None,
            status=None,
        )

    monkeypatch.setattr(main_module, "create_upload_item_in_sheet", fake)
    r = client.post(
        "/uploads/create",
        json={
            "title": "t",
            "note": None,
            "status": None,
        },
    )
    assert r.status_code == 200
    assert called["note"] is None
    assert called["status"] is None

    called.clear()
    r2 = client.post(
        "/uploads/create",
        json={
            "title": "t2",
            "note": "   ",
            "status": "\t",
        },
    )
    assert r2.status_code == 200
    assert called["note"] is None
    assert called["status"] is None


def test_uploads_create_422_empty_title(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(
        main_module,
        "create_upload_item_in_sheet",
        lambda *_a, **_k: UploadItem(
            id="c", title="x", file_name="f", uploaded_at="t", note=None, status=None
        ),
    )
    r = client.post("/uploads/create", json={"title": "   "})
    assert r.status_code == 422


def test_uploads_create_503_config(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)
    monkeypatch.delenv("GOOGLE_SHEET_URL", raising=False)

    def boom(*_a, **_k):
        raise SheetsConfigurationError("[설정] 테스트")

    monkeypatch.setattr(main_module, "create_upload_item_in_sheet", boom)
    r = client.post("/uploads/create", json={"title": "a"})
    assert r.status_code == 503
    assert "[설정]" in r.json().get("detail", "")


def test_uploads_create_502_sheets_api(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def boom(*_a, **_k):
        raise SheetsFetchError("[Sheets API] HTTP 500: x")

    monkeypatch.setattr(main_module, "create_upload_item_in_sheet", boom)
    r = client.post("/uploads/create", json={"title": "a"})
    assert r.status_code == 502
    assert "[Sheets API]" in r.json().get("detail", "")


def test_uploads_create_response_shape(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def fake(settings, *, title, file_name, uploaded_at, note, status):
        return UploadItem(
            id="d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
            title=title,
            file_name="fn",
            uploaded_at="2026-04-04T00:00:00+09:00",
            note=None,
            status="s",
        )

    monkeypatch.setattr(main_module, "create_upload_item_in_sheet", fake)
    r = client.post("/uploads/create", json={"title": "shape"})
    assert r.status_code == 200
    j = r.json()
    assert set(j.keys()) == {
        "id",
        "title",
        "file_name",
        "uploaded_at",
        "note",
        "status",
    }
    assert j["title"] == "shape"
    assert j["file_name"] == "fn"
    assert j["note"] is None
    assert j["status"] == "s"
    assert len(j["id"]) == 36
    assert j["id"].count("-") == 4


def test_uploads_create_422_extra_field(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(
        main_module,
        "create_upload_item_in_sheet",
        lambda *_a, **_k: UploadItem(
            id="e", title="x", file_name="f", uploaded_at="t", note=None, status=None
        ),
    )
    r = client.post("/uploads/create", json={"title": "a", "id": "evil"})
    assert r.status_code == 422
