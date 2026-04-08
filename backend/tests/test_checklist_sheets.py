import pytest
from fastapi.testclient import TestClient

import main as main_module
from schemas import ChecklistItem


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_checklist_503_when_google_env_missing(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)
    monkeypatch.delenv("GOOGLE_SHEET_URL", raising=False)
    monkeypatch.delenv("GOOGLE_SHEET_ID", raising=False)
    r = client.get("/checklist")
    assert r.status_code == 503
    detail = r.json().get("detail", "")
    assert "GOOGLE_SERVICE_ACCOUNT_FILE" in detail
    assert "GOOGLE_SHEET_URL" in detail


def test_checklist_200_when_sheets_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "dummy.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/dummy-sheet-id/edit",
    )

    def fake_fetch(_settings):
        return [ChecklistItem(id="t1", title="제목", note="메모")]

    monkeypatch.setattr(
        main_module,
        "fetch_checklist_from_google_sheets",
        fake_fetch,
    )
    r = client.get("/checklist")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == "t1"
    assert data[0]["title"] == "제목"
    assert data[0]["note"] == "메모"


def test_checklist_503_when_service_account_file_missing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    missing = tmp_path / "nope.json"
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(missing))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/any-id/edit",
    )
    r = client.get("/checklist")
    assert r.status_code == 503
    assert "[설정]" in r.json().get("detail", "")
    assert "찾을 수 없습니다" in r.json().get("detail", "")


def test_checklist_503_when_sheet_url_invalid(client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    p = tmp_path / "creds.json"
    p.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(p))
    monkeypatch.setenv("GOOGLE_SHEET_URL", "https://example.com/not-a-sheet")
    r = client.get("/checklist")
    assert r.status_code == 503
    detail = r.json().get("detail", "")
    assert "[설정]" in detail
    assert "GOOGLE_SHEET_URL" in detail
