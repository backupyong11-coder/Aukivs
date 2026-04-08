import pytest
from fastapi.testclient import TestClient

import main as main_module
from schemas import ChecklistItem, UploadItem
from services.sheets_errors import SheetsParseError


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_briefing_503_when_checklist_config_missing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)
    monkeypatch.delenv("GOOGLE_SHEET_URL", raising=False)
    r = client.get("/briefing/today")
    assert r.status_code == 503
    assert "[브리핑]" in r.json().get("detail", "")


def test_briefing_200_when_both_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    monkeypatch.setattr(
        main_module,
        "fetch_checklist_for_briefing",
        lambda _s: ([(ChecklistItem(id="1", title="할 일", note=None), 2)], []),
    )
    monkeypatch.setattr(
        main_module,
        "fetch_uploads_for_briefing",
        lambda _s: ([], []),
    )
    r = client.get("/briefing/today")
    assert r.status_code == 200
    data = r.json()
    assert "briefing_text" in data
    assert "summary" in data
    assert "urgent_items" in data
    assert data["warnings"] == []
    assert data["summary"]["today_checklist_count"] == 1


def test_briefing_200_when_uploads_have_row_warnings_not_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """브리핑은 업로드 일부 행만 문제여도 200 + warnings (전체 502 금지)."""
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(
        main_module,
        "fetch_checklist_for_briefing",
        lambda _s: ([], []),
    )

    def partial_uploads(_s):
        return (
            [
                (
                    UploadItem(
                        id="ok",
                        title="정상",
                        file_name="a.png",
                        uploaded_at="2026-04-01T10:00:00+09:00",
                        note=None,
                    ),
                    5,
                )
            ],
            ["브리핑: 업로드 시트 점검 메시지(샘플)"],
        )

    monkeypatch.setattr(main_module, "fetch_uploads_for_briefing", partial_uploads)
    r = client.get("/briefing/today")
    assert r.status_code == 200
    data = r.json()
    assert data["warnings"] == ["브리핑: 업로드 시트 점검 메시지(샘플)"]
    assert data["summary"]["overdue_upload_count"] >= 1
    assert len(data["urgent_items"]) >= 1
    assert data["urgent_items"][0]["uid"] == "upload-ok-2026-04-01T10:00:00+09:00-5"


def test_briefing_200_when_checklist_sheets_parse_error_degrades(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SheetsParseError 는 브리핑 전체 502 대신 해당 소스만 비우고 200."""
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def boom(_s):
        raise SheetsParseError("[파싱] 체크 시트 형식 오류(테스트)")

    monkeypatch.setattr(main_module, "fetch_checklist_for_briefing", boom)
    monkeypatch.setattr(
        main_module,
        "fetch_uploads_for_briefing",
        lambda _s: (
            [
                (
                    UploadItem(
                        id="u1",
                        title="업로드만",
                        file_name="f.png",
                        uploaded_at="2026-04-01T10:00:00+09:00",
                        note=None,
                    ),
                    2,
                )
            ],
            [],
        ),
    )
    r = client.get("/briefing/today")
    assert r.status_code == 200
    data = r.json()
    assert any(
        "체크리스트 시트를 읽지 못해" in w for w in data["warnings"]
    )
    assert "[파싱]" not in str(data["warnings"])
    assert data["summary"]["today_checklist_count"] == 0


def test_briefing_200_when_all_rows_unusable_but_no_system_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setattr(
        main_module,
        "fetch_checklist_for_briefing",
        lambda _s: ([], []),
    )
    monkeypatch.setattr(
        main_module,
        "fetch_uploads_for_briefing",
        lambda _s: ([], []),
    )
    r = client.get("/briefing/today")
    assert r.status_code == 200
    data = r.json()
    assert data["warnings"] == []
    assert data["urgent_items"] == []
    assert data["summary"]["today_upload_count"] == 0
