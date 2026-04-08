"""OpenAI Chat Completions — JSON object 응답만 파싱합니다."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .ai_errors import AIAPIError, AIParseError

_OPENAI_URL = "https://api.openai.com/v1/chat/completions"


def _strip_markdown_json_fence(text: str) -> str:
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


def openai_chat_completion_json(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_sec: float,
) -> dict[str, Any]:
    """
    Chat Completions를 호출하고 assistant content를 JSON 객체로 파싱합니다.
    response_format json_object 사용.
    """
    payload = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=timeout_sec) as client:
            r = client.post(_OPENAI_URL, headers=headers, json=payload)
    except httpx.TimeoutException as e:
        raise AIAPIError(
            f"[AI API] 요청 시간이 초과되었습니다({timeout_sec}s)."
        ) from e
    except httpx.RequestError as e:
        raise AIAPIError(f"[AI API] 연결 오류: {e}") from e

    try:
        body = r.json()
    except json.JSONDecodeError as e:
        raise AIAPIError(
            f"[AI API] HTTP {r.status_code}: 응답이 JSON이 아닙니다."
        ) from e

    if r.status_code != 200:
        err = body.get("error") if isinstance(body, dict) else None
        msg = err.get("message", str(body)) if isinstance(err, dict) else str(body)
        raise AIAPIError(f"[AI API] HTTP {r.status_code}: {msg}")

    try:
        choices = body["choices"]
        content = choices[0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise AIAPIError("[AI API] 응답에 choices/message/content가 없습니다.") from e

    if not content or not str(content).strip():
        raise AIAPIError("[AI API] 모델이 빈 응답을 반환했습니다.")

    raw = _strip_markdown_json_fence(str(content))
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise AIParseError(
            f"[파싱] 모델 응답을 JSON으로 읽을 수 없습니다: {e}"
        ) from e

    if not isinstance(parsed, dict):
        raise AIParseError("[파싱] 모델 JSON 최상위는 객체여야 합니다.")

    return parsed
