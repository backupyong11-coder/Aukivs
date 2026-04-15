"""메모장 탭 조회·추가."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main as main_module
from config import Settings
from main import app
from services.sheets_errors import SheetsParseError
from services.google_memo_sheets import (
    append_memo_row_to_google_sheets,
    fetch_memos_from_google_sheets,
)


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_memos_200_empty_when_parse_error_not_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def boom(_settings):
        raise SheetsParseError("[파싱] 헤더 오류")

    monkeypatch.setattr(main_module, "fetch_memos_from_google_sheets", boom)
    r = client.get("/memos")
    assert r.status_code == 200
    assert r.json() == []


def test_memos_503_when_google_env_missing(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)
    monkeypatch.delenv("GOOGLE_SHEET_URL", raising=False)
    r = client.get("/memos")
    assert r.status_code == 503
    detail = r.json().get("detail", "")
    assert "GOOGLE_SERVICE_ACCOUNT_FILE" in detail


def test_memos_200_when_sheets_mocked(client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/dummy-id/edit",
    )

    def fake_read(_cred, _sid, range_a1: str) -> list[list]:
        if range_a1.endswith("!1:1"):
            return [["메모내용", "메모날짜", "메모분류"]]
        return [
            ["메모내용", "메모날짜", "메모분류"],
            ["첫줄", "2026-04-01", "일반"],
            ["", "2026-04-02", ""],
            ["둘째", "2026-04-03", "긴급"],
        ]

    monkeypatch.setattr(
        "services.google_memo_sheets.read_sheet_tab_values",
        fake_read,
    )
    r = client.get("/memos")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["content"] == "둘째"
    assert data[0]["sheet_row"] == 4
    assert data[1]["content"] == "첫줄"
    assert data[1]["category"] == "일반"


def test_memos_append_calls_append(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    calls: list[tuple] = []

    def fake_read(_cred, _sid, range_a1: str) -> list[list]:
        return [["메모내용", "메모날짜", "메모분류"]]

    def fake_append(cred_path, spreadsheet_id, range_a1, values, **kwargs):
        calls.append((spreadsheet_id, range_a1, values))

    monkeypatch.setattr(
        "services.google_memo_sheets.read_sheet_tab_values",
        fake_read,
    )
    monkeypatch.setattr(
        "services.google_memo_sheets.append_rows_to_sheet_range",
        fake_append,
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
    append_memo_row_to_google_sheets(settings, "  본문  ", "운영")
    assert len(calls) == 1
    assert calls[0][0] == "abc123"
    row = calls[0][2][0]
    assert row[0] == "본문"
    assert row[2] == "운영"
    assert len(row[1]) >= 16  # YYYY-MM-DD HH:MM:SS
    assert row[1][4] == "-"
    assert row[1][10] == " "


def test_memos_append_api(client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    monkeypatch.setattr(
        "services.google_memo_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [["메모내용", "메모날짜", "메모분류"]],
    )
    monkeypatch.setattr(
        "services.google_memo_sheets.append_rows_to_sheet_range",
        lambda *_a, **_k: None,
    )
    r = client.post(
        "/memos/append",
        json={"content": "테스트", "category": "일반"},
    )
    assert r.status_code == 200
    assert r.json().get("appended") is True


def test_fetch_memos_accepts_category_header_bunryu(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    """시트에서 분류 열 제목이 '분류'만 있어도 인식."""
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(
        "services.google_memo_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["메모날짜", "분류", "메모내용"],
            ["2026-04-05", "운영", "테스트 메모"],
        ],
    )
    settings = Settings(
        google_service_account_file=str(creds),
        google_sheet_url="https://docs.google.com/spreadsheets/d/z/edit",
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
    items = fetch_memos_from_google_sheets(settings)
    assert len(items) == 1
    assert items[0].content == "테스트 메모"
    assert items[0].memo_date == "2026-04-05"
    assert items[0].category == "운영"


def test_fetch_memos_reordered_columns(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(
        "services.google_memo_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["메모분류", "메모내용", "메모날짜"],
            ["버그", "내용A", "2026-05-01"],
        ],
    )
    settings = Settings(
        google_service_account_file=str(creds),
        google_sheet_url="https://docs.google.com/spreadsheets/d/z/edit",
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
    items = fetch_memos_from_google_sheets(settings)
    assert len(items) == 1
    assert items[0].content == "내용A"
    assert items[0].memo_date == "2026-05-01"
    assert items[0].category == "버그"
