import pytest
from fastapi.testclient import TestClient

import main as main_module
from config import Settings
from schemas import UploadListItem, UploadListResponse
from services.google_uploads_sheets import fetch_upload_list_from_google_sheets


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_uploads_503_when_google_env_missing(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)
    monkeypatch.delenv("GOOGLE_SHEET_URL", raising=False)
    r = client.get("/uploads")
    assert r.status_code == 503
    detail = r.json().get("detail", "")
    assert "GOOGLE_SERVICE_ACCOUNT_FILE" in detail
    assert "GOOGLE_SHEET_URL" in detail


def test_uploads_200_when_sheets_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "dummy.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/dummy-id/edit",
    )

    def fake_fetch(_settings):
        return UploadListResponse(
            items=[
                UploadListItem(
                    uid="upload-u1-2026-04-01T00:00:00+09:00-2",
                    id="u1",
                    title="제목",
                    file_name="a.png",
                    uploaded_at="2026-04-01T00:00:00+09:00",
                    note="n",
                    status=None,
                )
            ],
            issues=[],
        )

    monkeypatch.setattr(
        main_module,
        "fetch_upload_list_from_google_sheets",
        fake_fetch,
    )
    r = client.get("/uploads")
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["file_name"] == "a.png"
    assert data["items"][0]["uploaded_at"] == "2026-04-01T00:00:00+09:00"
    assert data["items"][0]["uid"] == "upload-u1-2026-04-01T00:00:00+09:00-2"
    assert data["issues"] == []


def test_uploads_200_partial_rows_not_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    """일부 행만 누락이어도 GET /uploads 는 200 + issues."""
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/abc123/edit",
    )
    monkeypatch.setattr(
        "services.google_uploads_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["FALSE", "2026-04-06", "x.png", "정상", "", "", "", "", "", "", ""],
            ["FALSE", "", "y.png", "D열없음", "", "", "", "", "", "", ""],
        ],
    )
    r = client.get("/uploads")
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) == 2
    assert data["items"][0]["id"] == "sheet-row-2"
    assert data["items"][0]["uploaded_at"] == "2026-04-06T00:00:00+09:00"
    assert data["items"][1]["id"] == "sheet-row-3"
    assert data["items"][1]["uploaded_at"] == ""
    assert data["issues"] == []


def test_uploads_200_same_id_two_rows_distinct_uid(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/abc123/edit",
    )
    monkeypatch.setattr(
        "services.google_uploads_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["FALSE", "2026-04-01T10:00:00+09:00", "a.png", "첫", "", "", "", "", "", "", ""],
            ["FALSE", "2026-04-02T10:00:00+09:00", "b.png", "둘", "", "", "", "", "", "", ""],
        ],
    )
    r = client.get("/uploads")
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) == 2
    uids = {data["items"][0]["uid"], data["items"][1]["uid"]}
    assert len(uids) == 2
    ids = {data["items"][0]["id"], data["items"][1]["id"]}
    assert ids == {"sheet-row-2", "sheet-row-3"}
    assert data["issues"] == []


def test_uploads_200_same_id_three_rows_all_in_duplicate_issue(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/abc123/edit",
    )
    monkeypatch.setattr(
        "services.google_uploads_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["FALSE", "2026-04-01T10:00:00+09:00", "1.png", "a", "", "", "", "", "", "", ""],
            ["FALSE", "2026-04-02T10:00:00+09:00", "2.png", "b", "", "", "", "", "", "", ""],
            ["FALSE", "2026-04-03T10:00:00+09:00", "3.png", "c", "", "", "", "", "", "", ""],
        ],
    )
    r = client.get("/uploads")
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) == 3
    assert data["issues"] == []


def test_uploads_200_row_skip_and_duplicate_together(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/abc123/edit",
    )
    monkeypatch.setattr(
        "services.google_uploads_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["FALSE", "2026-04-01T10:00:00+09:00", "a.png", "정상1", "", "", "", "", "", "", ""],
            ["FALSE", "2026-04-02T10:00:00+09:00", "b.png", "정상2", "", "", "", "", "", "", ""],
            ["FALSE", "", "c.png", "누락", "", "", "", "", "", "", ""],
        ],
    )
    r = client.get("/uploads")
    assert r.status_code == 200
    data = r.json()
    assert data["issues"] == []
    assert len(data["items"]) == 3
    assert data["items"][2]["title"] == "누락"
    assert data["items"][2]["uploaded_at"] == ""


def test_uploads_200_all_rows_unusable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/abc123/edit",
    )
    monkeypatch.setattr(
        "services.google_uploads_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["", "", "", "", "", "", "", "", "", "", ""],
            ["FALSE", "2026-04-01T10:00:00+09:00", "a.png", "", "", "", "", "", "", "", ""],
        ],
    )
    r = client.get("/uploads")
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["issues"] == []


def test_uploads_502_on_sheets_fetch_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.sheets_errors import SheetsFetchError

    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def boom(_settings):
        raise SheetsFetchError("[Sheets API] 테스트")

    monkeypatch.setattr(main_module, "fetch_upload_list_from_google_sheets", boom)
    r = client.get("/uploads")
    assert r.status_code == 502


def test_uploads_503_when_credentials_file_missing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    missing = tmp_path / "missing.json"
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(missing))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    r = client.get("/uploads")
    assert r.status_code == 503
    assert "[설정]" in r.json().get("detail", "")


def test_fetch_upload_list_tolerates_missing_file_name_no_raise(
    monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(
        "services.google_uploads_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["FALSE", "2026-01-01T00:00:00+09:00", "", "제목만", "", "", "", "", "", "", ""],
        ],
    )
    settings = Settings(
        google_service_account_file=str(creds),
        google_sheet_url="https://docs.google.com/spreadsheets/d/abc123/edit",
        google_checklist_tab="체크리스트",
        google_uploads_tab="업로드운영",
        google_memo_tab="메모장",
        google_platform_tab="플랫폼마스터",
        google_works_tab="작품마스터",
        google_tasks_tab="업무정리",
        google_upload_rows_tab="업로드정리",
        openai_api_key=None,
        openai_model="gpt-4o-mini",
        openai_timeout_sec=45.0,
    )
    out = fetch_upload_list_from_google_sheets(settings)
    assert len(out.items) == 1
    assert out.items[0].title == "제목만"
    assert out.items[0].file_name == "(파일명 미입력)"
    assert out.issues == []
