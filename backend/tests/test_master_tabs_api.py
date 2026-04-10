# -*- coding: utf-8 -*-
"""GET /platform-master, GET /works-master"""

import pytest
from fastapi.testclient import TestClient

import main as main_module


@pytest.fixture
def client() -> TestClient:
    return TestClient(main_module.app)


def test_platform_master_200_mocked(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/abc123/edit",
    )

    monkeypatch.setattr(
        "services.google_master_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["플랫폼", "코드"],
            ["네이버", "NV"],
        ],
    )
    r = client.get("/platform-master")
    assert r.status_code == 200
    assert r.json() == {"items": [{"플랫폼": "네이버", "코드": "NV"}]}


def test_works_master_200_mocked(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    creds = tmp_path / "creds.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(creds))
    monkeypatch.setenv(
        "GOOGLE_SHEET_URL",
        "https://docs.google.com/spreadsheets/d/abc123/edit",
    )

    monkeypatch.setattr(
        "services.google_master_sheets.read_sheet_tab_values",
        lambda *_a, **_k: [
            ["작품", "회차"],
            ["테스트작", 12],
        ],
    )
    r = client.get("/works-master")
    assert r.status_code == 200
    assert r.json() == {"items": [{"작품": "테스트작", "회차": 12}]}


def test_platform_master_503_no_google_config(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)
    monkeypatch.delenv("GOOGLE_SHEET_URL", raising=False)
    r = client.get("/platform-master")
    assert r.status_code == 503
