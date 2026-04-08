"""업로드 목록 AI 제안(읽기 전용 — 시트에 쓰지 않음)."""

from __future__ import annotations

from typing import Any, Literal

from config import Settings
from schemas import (
    UploadItem,
    UploadSuggestPrioritizeItemOut,
    UploadSuggestPrioritizeResponse,
    UploadSuggestReviewItemOut,
    UploadSuggestReviewResponse,
)

from .ai_errors import AIConfigurationError, AIParseError
from .ai_openai import openai_chat_completion_json
from .google_uploads_sheets import fetch_uploads_from_google_sheets


def _format_uploads_for_prompt(items: list[UploadItem]) -> str:
    lines: list[str] = []
    for i, it in enumerate(items, start=1):
        note = it.note or ""
        status = it.status or ""
        lines.append(
            f"{i}. id={it.id!r} title={it.title!r} file_name={it.file_name!r} "
            f"uploaded_at={it.uploaded_at!r} note={note!r} status={status!r}"
        )
    return "\n".join(lines) if lines else "(없음)"


def _build_system_prompt(mode: Literal["prioritize", "review"]) -> str:
    if mode == "prioritize":
        return (
            "You are an operations assistant for upload/production workflows. "
            "Respond with a single JSON object only (no markdown), keys: "
            '"summary" (string, Korean), "items" (array). '
            "Each element of items must have exactly: "
            '"id" (string, MUST copy from the input list), '
            '"title" (string, should match the work title), '
            '"reason" (string, Korean, why this priority), '
            '"priority" (integer >= 1, 1 = highest), '
            '"suggested_action" (string, Korean, concrete next step). '
            "Order items by priority ascending in the array. "
            "Use only ids that appear in the user message."
        )
    return (
        "You are an operations assistant reviewing upload tracker rows. "
        "Respond with a single JSON object only (no markdown), keys: "
        '"summary" (string, Korean, overall review), "items" (array). '
        "Each element must have exactly: "
        '"id" (string, MUST copy from the input list), '
        '"title" (string), '
        '"issue" (string, Korean, risk or inconsistency), '
        '"suggestion" (string, Korean, how to improve). '
        "Focus on status, note, dates, and file names. "
        "Use only ids that appear in the user message."
    )


def _build_user_prompt(
    mode: Literal["prioritize", "review"],
    items: list[UploadItem],
    extra: str | None,
) -> str:
    block = _format_uploads_for_prompt(items)
    extra_line = f"\n사용자 추가 요청:\n{extra}\n" if extra else ""
    if mode == "prioritize":
        return (
            "다음은 현재 업로드 관리 목록입니다. 지금 먼저 처리할 항목 우선순위를 제안하세요.\n\n"
            f"{block}"
            f"{extra_line}"
        )
    return (
        "다음은 현재 업로드 관리 목록입니다. 상태·메모·시각을 보고 운영 점검 포인트를 제안하세요.\n\n"
        f"{block}"
        f"{extra_line}"
    )


def _cell_str(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def _normalize_prioritize_items(
    raw_items: Any,
    uploads: list[UploadItem],
) -> list[UploadSuggestPrioritizeItemOut]:
    if raw_items is None:
        return []
    if not isinstance(raw_items, list):
        raise AIParseError('[파싱] 모델 JSON의 "items"는 배열이어야 합니다.')

    known = {u.id for u in uploads}
    id_to_title = {u.id: u.title for u in uploads}

    out: list[UploadSuggestPrioritizeItemOut] = []
    for idx, row in enumerate(raw_items):
        if not isinstance(row, dict):
            raise AIParseError(f"[파싱] items[{idx}]는 객체여야 합니다.")

        uid = _cell_str(row.get("id"))
        if not uid:
            raise AIParseError(f"[파싱] items[{idx}].id가 비어 있습니다.")
        if uid not in known:
            raise AIParseError(
                f"[파싱] items[{idx}].id가 목록에 없습니다. "
                f"입력에 나온 id만 사용하세요: {uid!r}"
            )

        title = _cell_str(row.get("title"))
        if not title:
            title = id_to_title[uid]

        reason = _cell_str(row.get("reason"))
        suggested_action = _cell_str(row.get("suggested_action"))

        pr = row.get("priority", idx + 1)
        try:
            p_int = int(pr)
        except (TypeError, ValueError) as e:
            raise AIParseError(
                f"[파싱] items[{idx}].priority는 정수여야 합니다."
            ) from e
        if p_int < 1:
            p_int = idx + 1

        out.append(
            UploadSuggestPrioritizeItemOut(
                id=uid,
                title=title,
                reason=reason,
                priority=p_int,
                suggested_action=suggested_action,
            )
        )

    out.sort(key=lambda x: x.priority)
    return out


def _normalize_review_items(
    raw_items: Any,
    uploads: list[UploadItem],
) -> list[UploadSuggestReviewItemOut]:
    if raw_items is None:
        return []
    if not isinstance(raw_items, list):
        raise AIParseError('[파싱] 모델 JSON의 "items"는 배열이어야 합니다.')

    known = {u.id for u in uploads}
    id_to_title = {u.id: u.title for u in uploads}

    out: list[UploadSuggestReviewItemOut] = []
    for idx, row in enumerate(raw_items):
        if not isinstance(row, dict):
            raise AIParseError(f"[파싱] items[{idx}]는 객체여야 합니다.")

        uid = _cell_str(row.get("id"))
        if not uid:
            raise AIParseError(f"[파싱] items[{idx}].id가 비어 있습니다.")
        if uid not in known:
            raise AIParseError(
                f"[파싱] items[{idx}].id가 목록에 없습니다. "
                f"입력에 나온 id만 사용하세요: {uid!r}"
            )

        title = _cell_str(row.get("title"))
        if not title:
            title = id_to_title[uid]

        issue = _cell_str(row.get("issue"))
        suggestion = _cell_str(row.get("suggestion"))

        out.append(
            UploadSuggestReviewItemOut(
                id=uid,
                title=title,
                issue=issue,
                suggestion=suggestion,
            )
        )

    return out


def _parse_prioritize(data: dict[str, Any], uploads: list[UploadItem]) -> UploadSuggestPrioritizeResponse:
    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise AIParseError('[파싱] 모델 JSON에 유효한 "summary" 문자열이 없습니다.')
    items = _normalize_prioritize_items(data.get("items"), uploads)
    return UploadSuggestPrioritizeResponse(
        mode="prioritize",
        summary=summary.strip(),
        items=items,
    )


def _parse_review(data: dict[str, Any], uploads: list[UploadItem]) -> UploadSuggestReviewResponse:
    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise AIParseError('[파싱] 모델 JSON에 유효한 "summary" 문자열이 없습니다.')
    items = _normalize_review_items(data.get("items"), uploads)
    return UploadSuggestReviewResponse(
        mode="review",
        summary=summary.strip(),
        items=items,
    )


def suggest_uploads_ai(
    settings: Settings,
    mode: Literal["prioritize", "review"],
    extra_prompt: str | None,
) -> UploadSuggestPrioritizeResponse | UploadSuggestReviewResponse:
    items = fetch_uploads_from_google_sheets(settings)

    if not items:
        if mode == "prioritize":
            return UploadSuggestPrioritizeResponse(
                mode="prioritize",
                summary="현재 표시할 업로드 항목이 없어 우선순위 제안을 생략했습니다.",
                items=[],
            )
        return UploadSuggestReviewResponse(
            mode="review",
            summary="현재 표시할 업로드 항목이 없어 운영 검토 제안을 생략했습니다.",
            items=[],
        )

    if not settings.openai_api_key:
        raise AIConfigurationError(
            "[설정] OPENAI_API_KEY가 없습니다. backend/.env 에 키를 넣은 뒤 다시 시도하세요."
        )

    data = openai_chat_completion_json(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        system_prompt=_build_system_prompt(mode),
        user_prompt=_build_user_prompt(mode, items, extra_prompt),
        timeout_sec=settings.openai_timeout_sec,
    )
    if mode == "prioritize":
        return _parse_prioritize(data, items)
    return _parse_review(data, items)
