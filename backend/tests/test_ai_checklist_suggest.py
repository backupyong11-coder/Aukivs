import pytest
from fastapi.testclient import TestClient

import main as main_module
from schemas import ChecklistItem
from services.ai_errors import AIAPIError


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_ai_suggest_prioritize_ok(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    fake_items = [
        ChecklistItem(id="a", title="청구 검토", note=None),
        ChecklistItem(id="b", title="일반", note="메모"),
    ]

    monkeypatch.setattr(
        "services.ai_checklist_suggest.fetch_checklist_from_google_sheets",
        lambda _s: fake_items,
    )

    def fake_openai(**_kwargs):
        return {
            "summary": "청구를 먼저 하세요.",
            "items": [
                {"title": "청구 검토", "reason": "민감", "priority": 1},
                {"title": "일반", "reason": "나머지", "priority": 2},
            ],
        }

    monkeypatch.setattr(
        "services.ai_checklist_suggest.openai_chat_completion_json",
        fake_openai,
    )

    r = client.post(
        "/ai/checklist/suggest",
        json={"mode": "prioritize", "prompt": "오늘 안에"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "prioritize"
    assert data["summary"] == "청구를 먼저 하세요."
    assert len(data["items"]) == 2
    assert data["items"][0]["title"] == "청구 검토"
    assert data["items"][0]["priority"] == 1


def test_ai_suggest_draft_ok(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(
        "services.ai_checklist_suggest.fetch_checklist_from_google_sheets",
        lambda _s: [],
    )

    def fake_openai(**_kwargs):
        return {
            "summary": "초안입니다.",
            "items": [
                {"title": "원고 검수", "note": "주 1회"},
                {"title": "썸네일", "note": None},
            ],
        }

    monkeypatch.setattr(
        "services.ai_checklist_suggest.openai_chat_completion_json",
        fake_openai,
    )

    r = client.post("/ai/checklist/suggest", json={"mode": "draft"})
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "draft"
    assert data["summary"] == "초안입니다."
    assert len(data["items"]) == 2
    assert data["items"][0]["note"] == "주 1회"


def test_ai_suggest_no_openai_key(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    monkeypatch.setattr(
        "services.ai_checklist_suggest.fetch_checklist_from_google_sheets",
        lambda _s: [ChecklistItem(id="1", title="t", note=None)],
    )

    r = client.post("/ai/checklist/suggest", json={"mode": "prioritize"})
    assert r.status_code == 503
    assert "[설정]" in r.json().get("detail", "")


def test_ai_suggest_parse_fail(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(
        "services.ai_checklist_suggest.fetch_checklist_from_google_sheets",
        lambda _s: [ChecklistItem(id="1", title="t", note=None)],
    )

    def bad_openai(**_kwargs):
        return {"summary": "x", "items": "not-a-list"}

    monkeypatch.setattr(
        "services.ai_checklist_suggest.openai_chat_completion_json",
        bad_openai,
    )

    r = client.post("/ai/checklist/suggest", json={"mode": "prioritize"})
    assert r.status_code == 400
    assert "[파싱]" in r.json().get("detail", "")


def test_ai_suggest_empty_checklist_prioritize_no_openai_call(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    monkeypatch.setattr(
        "services.ai_checklist_suggest.fetch_checklist_from_google_sheets",
        lambda _s: [],
    )

    called: dict[str, bool] = {"ok": False}

    def boom(**_kwargs):
        called["ok"] = True
        raise RuntimeError("should not call OpenAI")

    monkeypatch.setattr(
        "services.ai_checklist_suggest.openai_chat_completion_json",
        boom,
    )

    r = client.post("/ai/checklist/suggest", json={"mode": "prioritize"})
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert called["ok"] is False


def test_ai_suggest_ai_api_error_mapped_502(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(
        "services.ai_checklist_suggest.fetch_checklist_from_google_sheets",
        lambda _s: [ChecklistItem(id="1", title="t", note=None)],
    )
    def boom(**_kwargs):
        raise AIAPIError("[AI API] rate limit")

    monkeypatch.setattr(
        "services.ai_checklist_suggest.openai_chat_completion_json",
        boom,
    )

    r = client.post("/ai/checklist/suggest", json={"mode": "prioritize"})
    assert r.status_code == 502
    assert "[AI API]" in r.json().get("detail", "")
