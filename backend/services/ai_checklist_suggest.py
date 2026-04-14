"""체크리스트 AI 제안(읽기 전용 — 시트에 쓰지 않음)."""

from __future__ import annotations

from typing import Any, Literal

from config import Settings
from schemas import ChecklistItem, ChecklistSuggestItemOut, ChecklistSuggestResponse

from .ai_errors import AIConfigurationError, AIParseError
from .ai_openai import openai_chat_completion_json
from .google_checklist_sheets import fetch_checklist_from_google_sheets


def _format_checklist_for_prompt(items: list[ChecklistItem]) -> str:
    lines: list[str] = []
    for i, it in enumerate(items, start=1):
        note = it.note or ""
        due = it.due_date or ""
        pr = it.priority or ""
        q = it.quantification or ""
        memo = it.memo or ""
        plat = it.platform or ""
        cat = it.category or ""
        lines.append(
            f"{i}. id={it.id!r} due_date={due!r} title={it.title!r} "
            f"platform={plat!r} category={cat!r} priority={pr!r} "
            f"quantification={q!r} memo={memo!r} note={note!r}",
        )
    return "\n".join(lines) if lines else "(없음)"


def _build_system_prompt(mode: Literal["prioritize", "draft"]) -> str:
    if mode == "prioritize":
        return (
            "You are an operations assistant. The user has an active checklist. "
            "Respond with a single JSON object only (no markdown), keys: "
            '"summary" (string, Korean), "items" (array). '
            "Each element of items must have: "
            '"title" (string), "reason" (string, Korean, why this priority), '
            '"priority" (integer >= 1, 1 = highest). '
            "Order items by priority ascending. "
            "Prefer titles that match or closely paraphrase the given checklist titles."
        )
    return (
        "You are an operations assistant. Suggest new checklist items as drafts. "
        "Respond with a single JSON object only (no markdown), keys: "
        '"summary" (string, Korean), "items" (array). '
        'Each element must have "title" (string), "note" (string or null). '
        "Titles and notes should be practical for a webtoon/production ops team."
    )


def _build_user_prompt(
    mode: Literal["prioritize", "draft"],
    items: list[ChecklistItem],
    extra: str | None,
) -> str:
    block = _format_checklist_for_prompt(items)
    extra_line = f"\n사용자 추가 요청:\n{extra}\n" if extra else ""
    if mode == "prioritize":
        return (
            "다음은 현재 활성 체크리스트(미완료)입니다. 우선순위를 제안하세요.\n\n"
            f"{block}"
            f"{extra_line}"
        )
    return (
        "다음은 현재 활성 체크리스트입니다. 비어 있을 수 있습니다. "
        "새 체크리스트 초안 항목을 제안하세요.\n\n"
        f"{block}"
        f"{extra_line}"
    )


def _normalize_items(
    mode: Literal["prioritize", "draft"],
    raw_items: Any,
) -> list[ChecklistSuggestItemOut]:
    if raw_items is None:
        return []
    if not isinstance(raw_items, list):
        raise AIParseError('[파싱] 모델 JSON의 "items"는 배열이어야 합니다.')

    out: list[ChecklistSuggestItemOut] = []
    for idx, row in enumerate(raw_items):
        if not isinstance(row, dict):
            raise AIParseError(f"[파싱] items[{idx}]는 객체여야 합니다.")
        title = row.get("title")
        if not isinstance(title, str) or not title.strip():
            raise AIParseError(f"[파싱] items[{idx}].title이 비어 있거나 문자열이 아닙니다.")
        title = title.strip()

        if mode == "prioritize":
            reason = row.get("reason", "")
            if reason is None:
                reason = ""
            if not isinstance(reason, str):
                reason = str(reason)
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
                ChecklistSuggestItemOut(
                    title=title,
                    reason=reason.strip(),
                    priority=p_int,
                    note=None,
                )
            )
        else:
            note = row.get("note")
            if note is not None and not isinstance(note, str):
                note = str(note)
            if isinstance(note, str):
                note = note.strip() or None
            out.append(
                ChecklistSuggestItemOut(
                    title=title,
                    reason=None,
                    priority=None,
                    note=note,
                )
            )

    out.sort(key=lambda x: (x.priority is None, x.priority or 999999))
    return out


def _parse_model_payload(
    mode: Literal["prioritize", "draft"],
    data: dict[str, Any],
) -> ChecklistSuggestResponse:
    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise AIParseError('[파싱] 모델 JSON에 유효한 "summary" 문자열이 없습니다.')
    items = _normalize_items(mode, data.get("items"))
    return ChecklistSuggestResponse(
        mode=mode,
        summary=summary.strip(),
        items=items,
    )


def suggest_checklist_ai(
    settings: Settings,
    mode: Literal["prioritize", "draft"],
    extra_prompt: str | None,
) -> ChecklistSuggestResponse:
    items = fetch_checklist_from_google_sheets(settings)

    if mode == "prioritize" and not items:
        return ChecklistSuggestResponse(
            mode="prioritize",
            summary="현재 표시할 활성 체크리스트가 없어 우선순위 제안을 생략했습니다.",
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
    return _parse_model_payload(mode, data)
