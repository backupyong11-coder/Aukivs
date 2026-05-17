"""테스트 기본: 로컬 .env 의 DATA_BACKEND=supabase 에 묶이지 않도록 시트 모드 고정."""

import pytest


@pytest.fixture(autouse=True)
def _force_data_backend_sheets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATA_BACKEND", "sheets")
