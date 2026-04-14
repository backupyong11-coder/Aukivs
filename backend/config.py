"""환경 변수 기반 설정. backend/.env 를 자동 로드합니다."""

from __future__ import annotations

import base64
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")


def _materialize_google_credentials_from_env() -> None:
    """
    Railway/Render 등: JSON 파일을 올릴 수 없을 때
    GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 로 받아
    임시 파일을 만들고 GOOGLE_SERVICE_ACCOUNT_FILE 을 가리키게 한다.
    이미 읽을 수 있는 GOOGLE_SERVICE_ACCOUNT_FILE 경로가 있으면 그대로 둔다(로컬 우선).
    """
    file_path = (os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE") or "").strip()
    if file_path and Path(file_path).expanduser().is_file():
        return

    raw = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()
    b64 = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64") or "").strip()
    if b64:
        try:
            raw = base64.b64decode(b64).decode("utf-8").strip()
        except (ValueError, UnicodeDecodeError) as e:
            raise ValueError(
                "[설정] GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 디코딩에 실패했습니다."
            ) from e
    if not raw:
        return

    try:
        json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_JSON 이 올바른 JSON이 아닙니다."
        ) from e

    fd, path = tempfile.mkstemp(prefix="gcp_sa_", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(raw)
    os.environ["GOOGLE_SERVICE_ACCOUNT_FILE"] = path


@dataclass(frozen=True)
class Settings:
    """Google Sheets·OpenAI 등 백엔드 설정."""

    google_service_account_file: str | None
    google_sheet_url: str | None
    google_checklist_tab: str
    google_uploads_tab: str
    google_memo_tab: str
    google_platform_tab: str
    google_works_tab: str
    google_tasks_tab: str
    openai_api_key: str | None
    openai_model: str
    openai_timeout_sec: float


def load_settings() -> Settings:
    _materialize_google_credentials_from_env()

    uploads_tab = os.getenv("GOOGLE_UPLOADS_TAB", "업로드운영").strip() or "업로드운영"
    memo_tab = os.getenv("GOOGLE_MEMO_TAB", "메모장").strip() or "메모장"
    platform_tab = os.getenv("GOOGLE_PLATFORM_TAB", "플랫폼마스터").strip() or "플랫폼마스터"
    works_tab = os.getenv("GOOGLE_WORKS_TAB", "작품마스터").strip() or "작품마스터"
    tasks_tab = os.getenv("GOOGLE_TASKS_TAB", "업무정리").strip() or "업무정리"
    # 미설정 시 업무정리 탭과 동일(체크리스트 전용 탭을 쓰려면 GOOGLE_CHECKLIST_TAB=체크리스트 로 명시)
    _raw_checklist = os.getenv("GOOGLE_CHECKLIST_TAB")
    checklist_tab = (
        (_raw_checklist or "").strip() or tasks_tab
    )
    raw_key = os.getenv("OPENAI_API_KEY")
    openai_key = raw_key.strip() if raw_key and str(raw_key).strip() else None
    openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    try:
        openai_timeout = float(os.getenv("OPENAI_TIMEOUT_SEC", "45"))
    except ValueError:
        openai_timeout = 45.0
    if openai_timeout <= 0:
        openai_timeout = 45.0
    return Settings(
        google_service_account_file=os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE"),
        google_sheet_url=os.getenv("GOOGLE_SHEET_URL"),
        google_checklist_tab=checklist_tab,
        google_uploads_tab=uploads_tab,
        google_memo_tab=memo_tab,
        google_platform_tab=platform_tab,
        google_works_tab=works_tab,
        google_tasks_tab=tasks_tab,
        openai_api_key=openai_key,
        openai_model=openai_model,
        openai_timeout_sec=openai_timeout,
    )
