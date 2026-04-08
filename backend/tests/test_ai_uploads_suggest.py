import pytest
from fastapi.testclient import TestClient

import main as main_module
from schemas import UploadItem
from services.ai_errors import AIAPIError


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def _sample_uploads() -> list[UploadItem]:
    return [
        UploadItem(
            id="u1",
            title="작품 A 12화",
            file_name="a.psd",
            uploaded_at="2026-04-01T10:00:00+09:00",
            note="검수 대기",
            status="검수중",
        ),
        UploadItem(
            id="u2",
            title="작품 B 썸네일",
            file_name="b.png",
            uploaded_at="2026-04-02T11:00:00+09:00",
            note=None,
            status="대기",
        ),
    ]


def test_ai_uploads_suggest_prioritize_ok(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(
        "services.ai_uploads_suggest.fetch_uploads_from_google_sheets",
        lambda _s: _sample_uploads(),
    )

    def fake_openai(**_kwargs):
        return {
            "summary": "검수중인 항목을 먼저 처리하세요.",
            "items": [
                {
                    "id": "u1",
                    "title": "작품 A 12화",
                    "reason": "검수 단계",
                    "priority": 1,
                    "suggested_action": "검수자에게 회신",
                },
                {
                    "id": "u2",
                    "title": "작품 B 썸네일",
                    "reason": "대기",
                    "priority": 2,
                    "suggested_action": "파일 확인",
                },
            ],
        }

    monkeypatch.setattr(
        "services.ai_uploads_suggest.openai_chat_completion_json",
        fake_openai,
    )

    r = client.post(
        "/ai/uploads/suggest",
        json={"mode": "prioritize", "prompt": "오늘 중"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "prioritize"
    assert data["summary"] == "검수중인 항목을 먼저 처리하세요."
    assert len(data["items"]) == 2
    assert data["items"][0]["id"] == "u1"
    assert data["items"][0]["priority"] == 1
    assert data["items"][0]["suggested_action"] == "검수자에게 회신"


def test_ai_uploads_suggest_review_ok(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(
        "services.ai_uploads_suggest.fetch_uploads_from_google_sheets",
        lambda _s: _sample_uploads(),
    )

    def fake_openai(**_kwargs):
        return {
            "summary": "메모가 비어 있는 항목을 정리하세요.",
            "items": [
                {
                    "id": "u2",
                    "title": "작품 B 썸네일",
                    "issue": "메모 없음",
                    "suggestion": "진행 상황 메모 추가",
                },
            ],
        }

    monkeypatch.setattr(
        "services.ai_uploads_suggest.openai_chat_completion_json",
        fake_openai,
    )

    r = client.post("/ai/uploads/suggest", json={"mode": "review"})
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "review"
    assert data["summary"] == "메모가 비어 있는 항목을 정리하세요."
    assert len(data["items"]) == 1
    assert data["items"][0]["issue"] == "메모 없음"
    assert data["items"][0]["suggestion"] == "진행 상황 메모 추가"


def test_ai_uploads_suggest_no_openai_key(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    monkeypatch.setattr(
        "services.ai_uploads_suggest.fetch_uploads_from_google_sheets",
        lambda _s: _sample_uploads(),
    )

    r = client.post("/ai/uploads/suggest", json={"mode": "prioritize"})
    assert r.status_code == 503
    assert "[설정]" in r.json().get("detail", "")


def test_ai_uploads_suggest_parse_fail(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(
        "services.ai_uploads_suggest.fetch_uploads_from_google_sheets",
        lambda _s: _sample_uploads(),
    )

    def bad_openai(**_kwargs):
        return {"summary": "x", "items": "not-a-list"}

    monkeypatch.setattr(
        "services.ai_uploads_suggest.openai_chat_completion_json",
        bad_openai,
    )

    r = client.post("/ai/uploads/suggest", json={"mode": "review"})
    assert r.status_code == 400
    assert "[파싱]" in r.json().get("detail", "")


def test_ai_uploads_suggest_empty_uploads_no_openai(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    monkeypatch.setattr(
        "services.ai_uploads_suggest.fetch_uploads_from_google_sheets",
        lambda _s: [],
    )

    called: dict[str, bool] = {"ok": False}

    def boom(**_kwargs):
        called["ok"] = True
        raise RuntimeError("should not call OpenAI")

    monkeypatch.setattr(
        "services.ai_uploads_suggest.openai_chat_completion_json",
        boom,
    )

    r = client.post("/ai/uploads/suggest", json={"mode": "prioritize"})
    assert r.status_code == 200
    assert r.json()["mode"] == "prioritize"
    assert r.json()["items"] == []
    assert called["ok"] is False

    r2 = client.post("/ai/uploads/suggest", json={"mode": "review"})
    assert r2.status_code == 200
    assert r2.json()["mode"] == "review"
    assert r2.json()["items"] == []


def test_ai_uploads_suggest_ai_api_error_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(
        "services.ai_uploads_suggest.fetch_uploads_from_google_sheets",
        lambda _s: _sample_uploads(),
    )

    def boom(**_kwargs):
        raise AIAPIError("[AI API] rate limit")

    monkeypatch.setattr(
        "services.ai_uploads_suggest.openai_chat_completion_json",
        boom,
    )

    r = client.post("/ai/uploads/suggest", json={"mode": "prioritize"})
    assert r.status_code == 502
    assert "[AI API]" in r.json().get("detail", "")
