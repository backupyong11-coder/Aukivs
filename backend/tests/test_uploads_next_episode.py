from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main as main_module
from services.sheets_errors import SheetsInvalidStateError, SheetsNotFoundError, SheetsParseError


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


@pytest.fixture
def env_uploads(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    creds = tmp_path / "c.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )
    return creds


def test_next_episode_200_mocked_sheet(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    env_uploads: Path,
) -> None:
    def fake_rows(settings):
        return (
            env_uploads,
            "spreadsid",
            [
                [
                    "u1",
                    "제목",
                    "a.png",
                    "2026-04-01T10:00:00+09:00",
                    "",
                    "대기",
                ],
            ],
        )

    monkeypatch.setattr(
        "services.google_uploads_sheets._upload_sheet_rows",
        fake_rows,
    )
    batches: list = []

    def fake_batch(cp, sid, data):
        batches.append((cp, sid, data))

    monkeypatch.setattr(
        "services.google_uploads_sheets.batch_update_sheet_values",
        fake_batch,
    )
    r = client.post("/uploads/next-episode", json={"id": "u1"})
    assert r.status_code == 200
    assert r.json() == {"advanced": True}
    assert len(batches) == 1
    _, _, data = batches[0]
    assert len(data) == 2
    assert data[0]["values"] == [["검수중"]]
    assert "'업로드운영'!F2" in data[0]["range"] or "!F2" in data[0]["range"]
    d_val = data[1]["values"][0][0]
    assert "+09:00" in d_val or d_val.endswith("+09:00")


def test_next_episode_400_invalid_terminal_status(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    env_uploads: Path,
) -> None:
    def fake_rows(settings):
        return (
            env_uploads,
            "spreadsid",
            [
                [
                    "u1",
                    "제목",
                    "a.png",
                    "2026-04-01T10:00:00+09:00",
                    "",
                    "완료",
                ],
            ],
        )

    monkeypatch.setattr(
        "services.google_uploads_sheets._upload_sheet_rows",
        fake_rows,
    )
    monkeypatch.setattr(
        "services.google_uploads_sheets.batch_update_sheet_values",
        lambda *_a, **_k: None,
    )
    r = client.post("/uploads/next-episode", json={"id": "u1"})
    assert r.status_code == 400
    assert "[유효하지않은상태]" in r.json().get("detail", "")


def test_next_episode_400_unknown_status(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    env_uploads: Path,
) -> None:
    def fake_rows(settings):
        return (
            env_uploads,
            "spreadsid",
            [
                [
                    "u1",
                    "제목",
                    "a.png",
                    "2026-04-01T10:00:00+09:00",
                    "",
                    "임의상태",
                ],
            ],
        )

    monkeypatch.setattr(
        "services.google_uploads_sheets._upload_sheet_rows",
        fake_rows,
    )
    r = client.post("/uploads/next-episode", json={"id": "u1"})
    assert r.status_code == 400
    assert "[유효하지않은상태]" in r.json().get("detail", "")


def test_next_episode_404(client: TestClient, monkeypatch: pytest.MonkeyPatch, env_uploads: Path) -> None:
    def fake_rows(settings):
        return (
            env_uploads,
            "spreadsid",
            [
                [
                    "other",
                    "제목",
                    "a.png",
                    "2026-04-01T10:00:00+09:00",
                    "",
                    "대기",
                ],
            ],
        )

    monkeypatch.setattr(
        "services.google_uploads_sheets._upload_sheet_rows",
        fake_rows,
    )
    r = client.post("/uploads/next-episode", json={"id": "missing"})
    assert r.status_code == 404
    assert "[찾을수없음]" in r.json().get("detail", "")


def test_next_episode_422_empty_id(client: TestClient, monkeypatch: pytest.MonkeyPatch, env_uploads: Path) -> None:
    monkeypatch.setattr(
        main_module,
        "advance_upload_next_episode",
        lambda *_a, **_k: None,
    )
    r = client.post("/uploads/next-episode", json={"id": "   "})
    assert r.status_code == 422


def test_next_episode_400_parse_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    env_uploads: Path,
) -> None:
    def boom(settings):
        raise SheetsParseError("[파싱] 시트 데이터를 읽을 수 없습니다.")

    monkeypatch.setattr(
        "services.google_uploads_sheets._upload_sheet_rows",
        boom,
    )
    r = client.post("/uploads/next-episode", json={"id": "u1"})
    assert r.status_code == 400
    assert "[파싱]" in r.json().get("detail", "")


def test_next_episode_service_mock_404_propagates(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def fake(*_a, **_k):
        raise SheetsNotFoundError("[찾을수없음] 업로드 목록에 없는 id입니다: x")

    monkeypatch.setattr(main_module, "advance_upload_next_episode", fake)
    r = client.post("/uploads/next-episode", json={"id": "x"})
    assert r.status_code == 404


def test_next_episode_service_mock_invalid_state(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", "x.json")
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/x/edit",
    )

    def fake(*_a, **_k):
        raise SheetsInvalidStateError("[유효하지않은상태] 테스트")

    monkeypatch.setattr(main_module, "advance_upload_next_episode", fake)
    r = client.post("/uploads/next-episode", json={"id": "u1"})
    assert r.status_code == 400
