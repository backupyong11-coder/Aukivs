"""DATA_BACKEND=supabase 일 때 public.platform_rows + /platform-rows API 호환."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from config import Settings
from services.supabase_client import SupabaseRestClient
from services.sheets_errors import SheetsNotFoundError, SheetsParseError

_SEOUL = ZoneInfo("Asia/Seoul")

# migrate_sheets_to_supabase._PLATFORM_CORE_SHEET_HEADERS 와 동일 (DB 코어 ↔ 시트 헤더)
_CORE_SHEET_HEADERS: frozenset[str] = frozenset(
    {
        "회사명",
        "분류",
        "대분류",
        "발표일",
        "지원사업",
        "일반계약",
        "불가",
        "예정",
        "진행중",
        "완료",
        "계약",
        "미팅",
        "현재단계",
        "마지막업데이트날짜",
        "마지막 상황",
        "마지막상황",
        "대기사유",
        "다음액션",
        "플랫폼명",
        "우선순위",
        "비고",
        "메모",
    }
)

# 시트에 있지만 extra에 아직 값이 없어 마이그레이션에서 빠진 열
_KNOWN_PLATFORM_EXTRA_HEADERS: frozenset[str] = frozenset({"보류"})

_SELECT = (
    "id,legacy_id,sheet_row,company_name,category,major_category,announcement_date,subsidy_program,"
    "contract_general,blocked,scheduled,in_progress,done,contract_status,meeting,"
    "current_stage,last_updated_at,last_updated_at_raw,last_situation,waiting_reason,"
    "next_action,platform_name,priority,note,extra"
)


def _client(settings: Settings) -> SupabaseRestClient:
    return SupabaseRestClient(
        settings.supabase_url or "",
        settings.supabase_service_role_key or "",
    )


def _truthy(v: object) -> bool:
    if v is None:
        return False
    s = str(v).strip().upper()
    return s in ("TRUE", "1", "YES", "Y", "✓", "완료")


def _opt_text(v: object) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _normalize_sheet_row(r: dict[str, Any]) -> int | None:
    sr_raw = r.get("sheet_row")
    if isinstance(sr_raw, (int, float)) and not isinstance(sr_raw, bool):
        return int(sr_raw)
    if isinstance(sr_raw, str) and sr_raw.strip().isdigit():
        return int(sr_raw.strip())
    return None


def _fmt_last_updated_display(
    last_updated_at: object | None,
    last_updated_at_raw: object | None,
) -> str:
    raw = str(last_updated_at_raw).strip() if last_updated_at_raw is not None else ""
    if raw:
        return raw
    if last_updated_at is None:
        return ""
    s = str(last_updated_at).strip()
    if not s:
        return ""
    try:
        norm = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(norm)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(_SEOUL).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return s


def _bool_cell(b: bool) -> str:
    return "TRUE" if b else ""


def _api_dict(r: dict[str, Any]) -> dict[str, Any]:
    legacy_id = (r.get("legacy_id") or "").strip()
    sheet_row = _normalize_sheet_row(r)
    if sheet_row is not None and sheet_row >= 2:
        out_id = f"platform-row-{sheet_row}"
    elif legacy_id:
        out_id = legacy_id
    else:
        out_id = str(r.get("id") or "")

    last_sit = (r.get("last_situation") or "") if r.get("last_situation") is not None else ""
    last_sit = str(last_sit).strip()

    note_val = (r.get("note") or "") if r.get("note") is not None else ""
    note_val = str(note_val).strip()

    extra = r.get("extra") or {}
    if not isinstance(extra, dict):
        extra = {}

    out: dict[str, Any] = {
        "id": out_id,
        "sheet_row": sheet_row,
        "회사명": str(r.get("company_name") or "").strip(),
        "분류": str(r.get("category") or "").strip(),
        "대분류": str(r.get("major_category") or "").strip(),
        "발표일": str(r.get("announcement_date") or "").strip(),
        "지원사업": _bool_cell(bool(r.get("subsidy_program"))),
        "일반계약": str(r.get("contract_general") or "").strip(),
        "불가": _bool_cell(bool(r.get("blocked"))),
        "예정": _bool_cell(bool(r.get("scheduled"))),
        "진행중": _bool_cell(bool(r.get("in_progress"))),
        "완료": _bool_cell(bool(r.get("done"))),
        "계약": str(r.get("contract_status") or "").strip(),
        "미팅": str(r.get("meeting") or "").strip(),
        "현재단계": str(r.get("current_stage") or "").strip(),
        "마지막업데이트날짜": _fmt_last_updated_display(
            r.get("last_updated_at"), r.get("last_updated_at_raw")
        ),
        "마지막 상황": last_sit,
        "마지막상황": last_sit,
        "대기사유": str(r.get("waiting_reason") or "").strip(),
        "다음액션": str(r.get("next_action") or "").strip(),
        "플랫폼명": str(r.get("platform_name") or "").strip(),
        "우선순위": str(r.get("priority") or "").strip(),
        "비고": note_val,
        "메모": note_val,
    }

    for k, v in sorted(extra.items(), key=lambda kv: str(kv[0])):
        key = str(k)
        if key in out:
            continue
        if key in _CORE_SHEET_HEADERS:
            continue
        if v is None:
            out[key] = ""
        elif isinstance(v, (dict, list)):
            out[key] = json.dumps(v, ensure_ascii=False)
        else:
            out[key] = str(v).strip() if str(v).strip() else ""
    return out


_SELECT_MASTER_SLIM = (
    "id,legacy_id,sheet_row,company_name,platform_name,current_stage,"
    "last_situation,next_action,priority,last_updated_at,last_updated_at_raw,note"
)


def list_platform_master_slim(
    settings: Settings, *, limit: int = 200
) -> list[dict[str, Any]]:
    """GET /platform-master · 플랫폼 매트릭스용 — platform_rows에서 요약만."""
    rows = _client(settings).get_json(
        "/platform_rows",
        params={
            "select": _SELECT_MASTER_SLIM,
            "order": "last_updated_at.desc.nullslast",
            "limit": str(max(1, int(limit))),
        },
    )
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in rows:
        if not isinstance(r, dict):
            continue
        d = _api_dict(r)
        name = (d.get("플랫폼명") or d.get("회사명") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(
            {
                "회사명": d.get("회사명") or "",
                "플랫폼명": d.get("플랫폼명") or "",
                "현재단계": d.get("현재단계") or "",
                "마지막상황": d.get("마지막상황") or d.get("마지막 상황") or "",
                "다음액션": d.get("다음액션") or "",
                "우선순위": d.get("우선순위") or "",
                "비고": d.get("비고") or "",
            }
        )
    return out


_SELECT_LOOKUP = "id,legacy_id,sheet_row,company_name,platform_name,last_situation,waiting_reason,next_action,priority,note,category,current_stage"


def list_platform_rows_lookup(
    settings: Settings, *, limit: int = 400
) -> list[dict[str, Any]]:
    """편집 모달용 — 전체 행보다 가벼운 조회."""
    rows = _client(settings).get_json(
        "/platform_rows",
        params={
            "select": _SELECT_LOOKUP,
            "order": "last_updated_at.desc.nullslast",
            "limit": str(max(1, int(limit))),
        },
    )
    if not isinstance(rows, list):
        raise SheetsParseError("Supabase platform_rows 응답 형식 오류")
    out: list[dict[str, Any]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        d = _api_dict(r)
        if not str(d.get("회사명") or "").strip():
            continue
        out.append(d)
    return out


def list_platform_rows(settings: Settings) -> list[dict[str, Any]]:
    rows = _client(settings).get_json(
        "/platform_rows",
        params={
            "select": _SELECT,
            "order": "sheet_row.asc.nullslast",
        },
    )
    if not isinstance(rows, list):
        raise SheetsParseError("Supabase platform_rows 응답 형식 오류")
    extra_keys: set[str] = set(_KNOWN_PLATFORM_EXTRA_HEADERS)
    staged: list[dict[str, Any]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        ex = r.get("extra") or {}
        if isinstance(ex, dict):
            for k in ex:
                key = str(k)
                if key and key not in _CORE_SHEET_HEADERS:
                    extra_keys.add(key)
        d = _api_dict(r)
        if not str(d.get("회사명") or "").strip():
            continue
        staged.append(d)
    out: list[dict[str, Any]] = []
    for d in staged:
        for k in extra_keys:
            if k not in d:
                d[k] = ""
        out.append(d)
    return out


def _get_row_or_raise(
    settings: Settings,
    client_id: str,
) -> tuple[str, dict[str, Any]]:
    cid = str(client_id).strip()
    if not cid:
        raise SheetsNotFoundError("[찾을수없음] id가 비어 있습니다.")
    cl = _client(settings)
    if re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", cid, re.I
    ):
        rows = cl.get_json(
            "/platform_rows",
            params={"select": _SELECT, "id": f"eq.{cid}", "limit": "1"},
        )
        if isinstance(rows, list) and rows:
            return str(rows[0]["id"]), rows[0]
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {cid}")
    m = re.fullmatch(r"platform-row-(\d+)", cid, re.I)
    if m:
        n = int(m.group(1))
        rows = cl.get_json(
            "/platform_rows",
            params={"select": _SELECT, "sheet_row": f"eq.{n}", "limit": "1"},
        )
        if isinstance(rows, list) and rows:
            return str(rows[0]["id"]), rows[0]
    rows = cl.get_json(
        "/platform_rows",
        params={"select": _SELECT, "legacy_id": f"eq.{cid}", "limit": "1"},
    )
    if isinstance(rows, list) and rows:
        return str(rows[0]["id"]), rows[0]
    raise SheetsNotFoundError(f"[찾을수없음] id 없음: {cid}")


def _next_sheet_row(settings: Settings) -> int:
    rows = _client(settings).get_json(
        "/platform_rows",
        params={
            "select": "sheet_row",
            "order": "sheet_row.desc.nullslast",
            "limit": "1",
        },
    )
    if isinstance(rows, list) and rows:
        sr = rows[0].get("sheet_row")
        if isinstance(sr, (int, float)) and not isinstance(sr, bool):
            return int(sr) + 1
    return 2


def _merge_core_into_patch(
    fields: dict[str, Any],
    patch: dict[str, Any],
    *,
    allow_company: bool,
) -> None:
    if allow_company and "회사명" in fields:
        patch["company_name"] = _opt_text(fields.get("회사명"))
    if "분류" in fields:
        patch["category"] = _opt_text(fields.get("분류"))
    if "대분류" in fields:
        patch["major_category"] = _opt_text(fields.get("대분류"))
    if "발표일" in fields:
        patch["announcement_date"] = _opt_text(fields.get("발표일"))
    if "지원사업" in fields:
        patch["subsidy_program"] = _truthy(fields.get("지원사업"))
    if "일반계약" in fields:
        patch["contract_general"] = _opt_text(fields.get("일반계약"))
    if "불가" in fields:
        patch["blocked"] = _truthy(fields.get("불가"))
    if "예정" in fields:
        patch["scheduled"] = _truthy(fields.get("예정"))
    if "진행중" in fields:
        patch["in_progress"] = _truthy(fields.get("진행중"))
    if "완료" in fields:
        patch["done"] = _truthy(fields.get("완료"))
    if "계약" in fields:
        patch["contract_status"] = _opt_text(fields.get("계약"))
    if "미팅" in fields:
        patch["meeting"] = _opt_text(fields.get("미팅"))
    if "현재단계" in fields:
        patch["current_stage"] = _opt_text(fields.get("현재단계"))
    if "플랫폼명" in fields:
        patch["platform_name"] = _opt_text(fields.get("플랫폼명"))
    if "우선순위" in fields:
        patch["priority"] = _opt_text(fields.get("우선순위"))
    if "대기사유" in fields:
        patch["waiting_reason"] = _opt_text(fields.get("대기사유"))
    if "다음액션" in fields:
        patch["next_action"] = _opt_text(fields.get("다음액션"))
    if "마지막상황" in fields or "마지막 상황" in fields:
        v = fields.get("마지막상황", fields.get("마지막 상황"))
        patch["last_situation"] = _opt_text(v)
    if "비고" in fields:
        patch["note"] = _opt_text(fields.get("비고"))
    elif "메모" in fields:
        patch["note"] = _opt_text(fields.get("메모"))


def _split_extra(
    fields: dict[str, Any],
    *,
    skip_company_in_extra: bool,
) -> dict[str, str]:
    ex: dict[str, str] = {}
    for k, v in fields.items():
        kr = str(k)
        if kr in ("id", "sheet_row"):
            continue
        if kr in _CORE_SHEET_HEADERS:
            continue
        if skip_company_in_extra and kr == "회사명":
            continue
        s = "" if v is None else str(v).strip()
        if s:
            ex[kr] = s
    return ex


def create_platform_row(settings: Settings, fields: dict[str, Any]) -> dict[str, Any]:
    c_name = str(fields.get("회사명", "")).strip()
    p_name = str(fields.get("플랫폼명", "")).strip()
    if not c_name and not p_name:
        raise SheetsParseError("[파싱] 회사명과 플랫폼명을 모두 비울 수 없습니다.")
    company_name = c_name or p_name

    n = _next_sheet_row(settings)
    legacy_id = f"platform-row-{n}"
    insert: dict[str, Any] = {
        "legacy_id": legacy_id,
        "sheet_row": n,
        "company_name": company_name,
        "extra": {},
    }
    patch_core: dict[str, Any] = {}
    _merge_core_into_patch(fields, patch_core, allow_company=False)
    patch_core.pop("company_name", None)
    insert.update(patch_core)

    extra = _split_extra(fields, skip_company_in_extra=True)
    insert["extra"] = extra

    rows = _client(settings).post_json(
        "/platform_rows", insert, prefer="return=representation"
    )
    if not isinstance(rows, list) or not rows:
        raise SheetsParseError("Supabase platform_rows.create 응답 없음")
    return _api_dict(rows[0])


def update_platform(settings: Settings, client_id: str, fields: dict[str, Any]) -> None:
    row_id, current = _get_row_or_raise(settings, client_id)
    patch: dict[str, Any] = {}
    _merge_core_into_patch(fields, patch, allow_company=False)

    base_ex = current.get("extra") or {}
    if not isinstance(base_ex, dict):
        base_ex = {}
    extra: dict[str, Any] = dict(base_ex)

    for k, v in fields.items():
        kr = str(k)
        if kr in ("id",):
            continue
        if kr in _CORE_SHEET_HEADERS:
            continue
        if kr == "회사명":
            continue
        s = "" if v is None else str(v).strip()
        if s:
            extra[kr] = s
        else:
            extra.pop(kr, None)

    patch["extra"] = extra
    patch["last_updated_at"] = datetime.now(timezone.utc).isoformat()
    patch["last_updated_at_raw"] = None

    _client(settings).patch_json(
        "/platform_rows", params={"id": f"eq.{row_id}"}, body=patch
    )


def delete_platform_row(settings: Settings, client_id: str) -> None:
    row_id, _ = _get_row_or_raise(settings, client_id)
    _client(settings).delete_json(
        "/platform_rows", params={"id": f"eq.{row_id}"}
    )

