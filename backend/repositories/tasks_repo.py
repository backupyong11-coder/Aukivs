"""DATA_BACKEND=supabase 일 때 public.tasks + 체크리스트 API 호환."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from config import Settings
from schemas import ChecklistItem
from services.supabase_client import SupabaseRestClient, SupabaseRequestError
from services.sheets_errors import SheetsNotFoundError, SheetsParseError

_SELECT_TASKS_BASE = (
    "id,legacy_id,sheet_row,date_group,priority,completed,due_date,due_date_raw,"
    "domain,category,major_category,quantification_minutes,title,quantification,quantification_type,"
    "time_raw,time_converted,platform,detail_value,detail_unit,related_work,"
    "difficulty,fatigue,extra"
)
_SELECT_TASKS_BASE_NO_EXTRA = (
    "id,legacy_id,sheet_row,date_group,priority,completed,due_date,due_date_raw,"
    "domain,category,major_category,quantification_minutes,title,quantification,quantification_type,"
    "time_raw,time_converted,platform,detail_value,detail_unit,related_work,"
    "difficulty,fatigue"
)
_SELECT_TASKS_BASE_WITH_EXEC = f"{_SELECT_TASKS_BASE},execute_date,execute_date_raw"

_SELECT_TASKS_WITH_MANAGER = f"{_SELECT_TASKS_BASE_WITH_EXEC},work_assignee,task_manager,memo"
_SELECT_TASKS_NEW = f"{_SELECT_TASKS_BASE_WITH_EXEC},work_assignee,memo"
_SELECT_TASKS_LEGACY = f"{_SELECT_TASKS_BASE_WITH_EXEC},status,assignee,memo"

_SELECT_TASKS_WITH_MANAGER_NO_EXEC = f"{_SELECT_TASKS_BASE},work_assignee,task_manager,memo"
_SELECT_TASKS_NEW_NO_EXEC = f"{_SELECT_TASKS_BASE},work_assignee,memo"
_SELECT_TASKS_LEGACY_NO_EXEC = f"{_SELECT_TASKS_BASE},status,assignee,memo"

_tasks_select_cache: str | None = None
_assignee_write_col_cache: str | None = None
_tasks_has_manager_col: bool | None = None
_tasks_has_execute_col: bool | None = None
_tasks_has_extra_col: bool | None = None


def _is_missing_column_error(exc: SupabaseRequestError) -> bool:
    if exc.status_code != 400:
        return False
    msg = str(exc).lower()
    return (
        "42703" in msg
        or "does not exist" in msg
        or "pgrst204" in msg
        or "could not find the" in msg
        or "schema cache" in msg
    )


_EXECUTE_HEADER = "실행일"


def _row_extra(row: dict[str, Any]) -> dict[str, Any]:
    ex = row.get("extra")
    return dict(ex) if isinstance(ex, dict) else {}


def _apply_execute_fields(
    patch: dict[str, Any],
    extra: dict[str, Any],
    raw: object,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """execute_date 컬럼 + extra['실행일'] 양방향 저장."""
    s = "" if raw is None else str(raw).strip()
    if not s:
        patch["execute_date"] = None
        patch["execute_date_raw"] = None
        extra.pop(_EXECUTE_HEADER, None)
    elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        patch["execute_date"] = s
        patch["execute_date_raw"] = None
        extra[_EXECUTE_HEADER] = s
    else:
        patch["execute_date"] = None
        patch["execute_date_raw"] = s
        extra[_EXECUTE_HEADER] = s
    patch["extra"] = extra
    return patch, extra


def _set_tasks_schema(*, variant: str, include_extra: bool = True) -> tuple[str, str]:
    global _tasks_select_cache, _assignee_write_col_cache, _tasks_has_manager_col, _tasks_has_execute_col, _tasks_has_extra_col
    use_exec = _tasks_has_execute_col is not False
    base = _SELECT_TASKS_BASE if include_extra else _SELECT_TASKS_BASE_NO_EXTRA
    _tasks_has_extra_col = include_extra
    if variant == "with_manager":
        _tasks_select_cache = (
            f"{base},execute_date,execute_date_raw,work_assignee,task_manager,memo"
            if use_exec
            else f"{base},work_assignee,task_manager,memo"
        )
        _assignee_write_col_cache = "work_assignee"
        _tasks_has_manager_col = True
    elif variant == "new":
        _tasks_select_cache = (
            f"{base},execute_date,execute_date_raw,work_assignee,memo"
            if use_exec
            else f"{base},work_assignee,memo"
        )
        _assignee_write_col_cache = "work_assignee"
        _tasks_has_manager_col = False
    else:
        _tasks_select_cache = (
            f"{base},execute_date,execute_date_raw,status,assignee,memo"
            if use_exec
            else f"{base},status,assignee,memo"
        )
        _assignee_write_col_cache = "status"
        _tasks_has_manager_col = False
    return _tasks_select_cache, _assignee_write_col_cache


def _reset_tasks_schema_cache() -> None:
    global _tasks_select_cache, _assignee_write_col_cache, _tasks_has_manager_col, _tasks_has_execute_col, _tasks_has_extra_col
    _tasks_select_cache = None
    _assignee_write_col_cache = None
    _tasks_has_manager_col = None
    _tasks_has_execute_col = None
    _tasks_has_extra_col = None


def _fetch_tasks(cli: SupabaseRestClient, params: dict[str, Any]) -> Any:
    """GET /tasks — work_assignee·execute_date·extra 마이그레이션 전·후 스키마 자동 전환."""
    global _tasks_has_execute_col
    base = {k: v for k, v in params.items() if k != "select"}
    last_exc: SupabaseRequestError | None = None
    for exec_supported in (True, False):
        _tasks_has_execute_col = exec_supported
        for extra_supported in (True, False):
            for variant in ("with_manager", "new", "legacy"):
                select, _ = _set_tasks_schema(
                    variant=variant,
                    include_extra=extra_supported,
                )
                try:
                    return cli.get_json("/tasks", params={**base, "select": select})
                except SupabaseRequestError as exc:
                    if _is_missing_column_error(exc):
                        last_exc = exc
                        _reset_tasks_schema_cache()
                        continue
                    raise
    if last_exc:
        raise last_exc
    raise SupabaseRequestError("Supabase GET /tasks failed: schema mismatch")


def _probe_tasks_schema(cli: SupabaseRestClient) -> tuple[str, str]:
    if _tasks_select_cache and _assignee_write_col_cache:
        return _tasks_select_cache, _assignee_write_col_cache
    _fetch_tasks(cli, {"limit": "1"})
    assert _tasks_select_cache and _assignee_write_col_cache
    return _tasks_select_cache, _assignee_write_col_cache


def _tasks_has_execute(cli: SupabaseRestClient) -> bool:
    _fetch_tasks(cli, {"limit": "1"})
    return _tasks_has_execute_col is not False


def _tasks_select(cli: SupabaseRestClient) -> str:
    return _probe_tasks_schema(cli)[0]


def _assignee_write_col(cli: SupabaseRestClient) -> str:
    return _probe_tasks_schema(cli)[1]

_EXTERNAL_ASSIGNEE_API_KEYS = ("외부담당자", "업무담당", "인물담당", "상태")

_KOREAN_TO_DB: dict[str, str] = {
    "날짜그룹": "date_group",
    "우선순위": "priority",
    "완료": "completed",
    "마감일": "due_date",
    "실행일": "execute_date",
    "분야": "domain",
    "분류": "category",
    "대분류": "major_category",
    "정량화 분": "quantification_minutes",
    "업무명": "title",
    "정량화": "quantification",
    "정량화 구분": "quantification_type",
    "시간": "time_raw",
    "시간변환": "time_converted",
    "관련플랫폼": "platform",
    "세부수치": "detail_value",
    "세부단위": "detail_unit",
    "관련작품": "related_work",
    "난이도": "difficulty",
    # NOTE: 2026-05-28 업무정리 헤더 변경 대응
    # - '피로도' → '담당자' (DB 컬럼은 fatigue 유지)
    # - '업무담당' → '외부담당자' (DB 컬럼은 work_assignee 유지)
    "피로도": "fatigue",
    "담당자": "fatigue",
    "업무담당": "work_assignee",
    "외부담당자": "work_assignee",
    "메모": "memo",
}

_CREATE_RESPONSE_KEYS: tuple[str, ...] = (
    "날짜그룹",
    "우선순위",
    "완료",
    "마감일",
    "실행일",
    "분야",
    "분류",
    "대분류",
    "정량화 분",
    "정량화",
    "정량화 구분",
    "시간",
    "시간변환",
    "관련플랫폼",
    "세부수치",
    "세부단위",
    "관련작품",
    "난이도",
    "담당자",
    "외부담당자",
    "메모",
)


def _client(settings: Settings) -> SupabaseRestClient:
    return SupabaseRestClient(
        settings.supabase_url or "",
        settings.supabase_service_role_key or "",
    )


def _truthy_cell(v: object) -> bool:
    s = str(v).strip().upper()
    return s in ("TRUE", "1", "YES", "Y", "완료", "✓")


def _completed_to_cell(val: bool) -> str:
    return "TRUE" if val else ""


def _bool_from_sheet_val(v: object) -> bool | None:
    if v is None or (isinstance(v, str) and not str(v).strip()):
        return None
    if isinstance(v, bool):
        return v
    return _truthy_cell(v)


def _work_assignee_from_row(row: dict[str, Any]) -> str:
    wa = row.get("work_assignee")
    if wa is not None and str(wa).strip():
        return str(wa).strip()
    status = row.get("status")
    if status is not None and str(status).strip():
        return str(status).strip()
    return ""


def _manager_from_fatigue(row: dict[str, Any]) -> str:
    v = row.get("fatigue")
    if v is None:
        return ""
    return str(v).strip()


def _db_row_to_task_dict(row: dict[str, Any]) -> dict[str, Any]:
    sr = row.get("sheet_row")
    sheet_row = int(sr) if isinstance(sr, int) else 0
    if sheet_row < 2:
        lid = row.get("legacy_id")
        m = re.match(r"^task-row-(\d+)$", str(lid or ""), flags=re.I)
        if m:
            sheet_row = max(2, int(m.group(1)))

    def opt_str(col: str) -> str:
        v = row.get(col)
        if v is None:
            return ""
        if isinstance(v, date):
            return v.isoformat()
        return str(v).strip()

    due = row.get("due_date")
    due_s = due.isoformat() if isinstance(due, date) else opt_str("due_date")
    if not due_s and row.get("due_date_raw"):
        due_s = str(row["due_date_raw"]).strip()

    ex_s = ""
    ex = row.get("execute_date")
    if isinstance(ex, date):
        ex_s = ex.isoformat()
    else:
        ex_s = opt_str("execute_date")
    if not ex_s and row.get("execute_date_raw"):
        ex_s = str(row["execute_date_raw"]).strip()
    if not ex_s:
        ex_s = str(_row_extra(row).get(_EXECUTE_HEADER) or "").strip()

    completed = bool(row.get("completed"))
    comp_cell = "TRUE" if completed else ""

    return {
        "id": f"task-row-{sheet_row}" if sheet_row >= 2 else str(row.get("legacy_id") or ""),
        "sheet_row": sheet_row if sheet_row >= 2 else None,
        "날짜그룹": opt_str("date_group"),
        "우선순위": opt_str("priority"),
        "완료": comp_cell,
        "마감일": due_s,
        "실행일": ex_s,
        "분야": opt_str("domain"),
        "분류": opt_str("category"),
        "대분류": opt_str("major_category"),
        "정량화 분": opt_str("quantification_minutes"),
        "업무명": opt_str("title"),
        "정량화": opt_str("quantification"),
        "정량화 구분": opt_str("quantification_type"),
        "시간": opt_str("time_raw"),
        "시간변환": opt_str("time_converted"),
        "관련플랫폼": opt_str("platform"),
        "세부수치": opt_str("detail_value"),
        "세부단위": opt_str("detail_unit"),
        "관련작품": opt_str("related_work"),
        "난이도": opt_str("difficulty"),
        "담당자": _manager_from_fatigue(row),
        "외부담당자": _work_assignee_from_row(row),
        "메모": opt_str("memo"),
    }


def _db_row_to_checklist_item(row: dict[str, Any]) -> ChecklistItem | None:
    title = str(row.get("title") or "").strip()
    if not title:
        return None
    if bool(row.get("completed")):
        return None
    sr = row.get("sheet_row")
    sheet_n = int(sr) if isinstance(sr, int) and sr >= 2 else None
    if sheet_n is None:
        lid = str(row.get("legacy_id") or "")
        m = re.match(r"^task-row-(\d+)$", lid, flags=re.I)
        sheet_n = int(m.group(1)) if m else 2
    cid = f"sheet-row-{sheet_n}"

    def opt(col: str) -> str | None:
        s = str(row.get(col) or "").strip()
        return s if s else None

    due = row.get("due_date")
    if isinstance(due, date):
        due_s = due.isoformat()
    else:
        due_s = opt("due_date")
    if not due_s:
        dr = row.get("due_date_raw")
        if dr is not None and str(dr).strip():
            due_s = str(dr).strip()

    return ChecklistItem(
        id=cid,
        title=title,
        note=None,
        due_date=due_s,
        platform=opt("platform"),
        category=opt("category"),
        priority=opt("priority"),
        quantification=opt("quantification"),
        difficulty=opt("difficulty"),
        fatigue=opt("fatigue"),
        work_status=_work_assignee_from_row(row) or None,
        memo=opt("memo"),
    )


def _get_task_by_client_id(cli: SupabaseRestClient, client_id: str) -> dict[str, Any] | None:
    cid = (client_id or "").strip()
    if not cid:
        return None

    def one(extra: dict[str, Any]) -> dict[str, Any] | None:
        params = {
            **extra,
            "limit": "1",
        }
        rows = _fetch_tasks(cli, params)
        if isinstance(rows, list) and rows and isinstance(rows[0], dict):
            return rows[0]
        return None

    row = one({"legacy_id": f"eq.{cid}"})
    if row:
        return row
    sm = re.match(r"^sheet-row-(\d+)$", cid, flags=re.I)
    if sm:
        n = int(sm.group(1))
        row = one({"sheet_row": f"eq.{n}"})
        if row:
            return row
        row = one({"legacy_id": f"eq.task-row-{n}"})
        if row:
            return row
    return None


def _next_sheet_row(cli: SupabaseRestClient) -> int:
    got = cli.get_json(
        "/tasks",
        params={
            "select": "sheet_row",
            "sheet_row": "not.is.null",
            "order": "sheet_row.desc.nullslast",
            "limit": "1",
        },
    )
    if isinstance(got, list) and got and isinstance(got[0], dict):
        m = got[0].get("sheet_row")
        if isinstance(m, int) and m >= 2:
            return m + 1
    return 2


def list_tasks(settings: Settings) -> list[dict[str, Any]]:
    return list_tasks_limited(settings, limit=None)


def list_tasks_limited(settings: Settings, *, limit: int | None = None) -> list[dict[str, Any]]:
    cli = _client(settings)
    params: dict[str, str] = {
        "order": "sheet_row.asc.nullslast",
    }
    if limit is not None and limit > 0:
        params["limit"] = str(int(limit))
    rows = _fetch_tasks(cli, params)
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        d = _db_row_to_task_dict(row)
        if (d.get("업무명") or "").strip():
            out.append(d)
    return out


def _patch_task_row(cli: SupabaseRestClient, row_id: object, patch: dict[str, Any]) -> None:
    remaining = dict(patch)
    last_exc: SupabaseRequestError | None = None
    for _ in range(max(1, len(remaining) + 4)):
        if not remaining:
            return
        try:
            cli.patch_json("/tasks", params={"id": f"eq.{row_id}"}, body=remaining)
            return
        except SupabaseRequestError as exc:
            if not _is_missing_column_error(exc):
                raise
            last_exc = exc
            msg = str(exc).lower()
            removed = False
            for col in ("execute_date", "execute_date_raw"):
                if col in remaining:
                    val = remaining.pop(col)
                    extra = remaining.get("extra")
                    if not isinstance(extra, dict):
                        extra = {}
                    if val is not None and str(val).strip():
                        extra[_EXECUTE_HEADER] = str(val).strip()
                    remaining["extra"] = extra
                    removed = True
                    break
            if not removed and "extra" in remaining and "extra" in msg:
                remaining.pop("extra")
                removed = True
            if not removed:
                for col in list(remaining.keys()):
                    if col.replace("_", " ") in msg or col in msg:
                        if col == "extra":
                            remaining.pop(col)
                        else:
                            val = remaining.pop(col)
                            extra = remaining.get("extra")
                            if not isinstance(extra, dict):
                                extra = {}
                            hdr = next(
                                (kr for kr, dbk in _KOREAN_TO_DB.items() if dbk == col),
                                col,
                            )
                            if val is not None and str(val).strip():
                                extra[hdr] = str(val).strip()
                            remaining["extra"] = extra
                        removed = True
                        break
            if not removed:
                raise
    if last_exc:
        raise last_exc


def _post_task_row(cli: SupabaseRestClient, insert: dict[str, Any]) -> None:
    remaining = dict(insert)
    last_exc: SupabaseRequestError | None = None
    for _ in range(max(1, len(remaining) + 4)):
        if not remaining:
            raise SheetsParseError("Supabase tasks.create 응답 없음")
        try:
            cli.post_json("/tasks", [remaining], prefer="return=minimal")
            return
        except SupabaseRequestError as exc:
            if not _is_missing_column_error(exc):
                raise
            last_exc = exc
            msg = str(exc).lower()
            removed = False
            for col in ("execute_date", "execute_date_raw"):
                if col in remaining:
                    val = remaining.pop(col)
                    extra = remaining.get("extra")
                    if not isinstance(extra, dict):
                        extra = {}
                    if val is not None and str(val).strip():
                        extra[_EXECUTE_HEADER] = str(val).strip()
                    remaining["extra"] = extra
                    removed = True
                    break
            if not removed and "extra" in remaining and "extra" in msg:
                remaining.pop("extra")
                removed = True
            if not removed:
                raise
    if last_exc:
        raise last_exc


def create_task(settings: Settings, fields: dict[str, Any]) -> dict[str, Any]:
    title = str(fields.get("업무명", "")).strip()
    if not title:
        raise SheetsParseError("[파싱] 업무명은 비울 수 없습니다.")
    cli = _client(settings)
    assignee_col = _probe_tasks_schema(cli)[1]
    sheet_row = _next_sheet_row(cli)
    legacy_id = f"task-row-{sheet_row}"

    insert: dict[str, Any] = {
        "legacy_id": legacy_id,
        "sheet_row": sheet_row,
        "title": title,
        "completed": False,
    }
    extra: dict[str, Any] = {}
    wb = _bool_from_sheet_val(fields.get("완료"))
    if wb is not None:
        insert["completed"] = wb

    for kr, dbk in _KOREAN_TO_DB.items():
        if kr in ("업무명", "완료"):
            continue
        if kr not in fields:
            continue
        raw = fields[kr]
        if raw is None or (isinstance(raw, str) and not str(raw).strip()):
            continue
        if dbk == "due_date":
            s = str(raw).strip()
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
                insert["due_date"] = s
            else:
                insert["due_date_raw"] = s
        elif dbk == "execute_date":
            tmp: dict[str, Any] = {}
            tmp, extra = _apply_execute_fields(tmp, extra, raw)
            for k, v in tmp.items():
                if k != "extra":
                    insert[k] = v
        elif dbk == "work_assignee":
            insert[assignee_col] = str(raw).strip()
        else:
            insert[dbk] = str(raw).strip()

    if assignee_col not in insert:
        for kr in _EXTERNAL_ASSIGNEE_API_KEYS:
            if kr not in fields:
                continue
            raw = fields[kr]
            if raw is None or (isinstance(raw, str) and not str(raw).strip()):
                continue
            insert[assignee_col] = str(raw).strip()
            break
    if "fatigue" not in insert and fields.get("담당자"):
        insert["fatigue"] = str(fields["담당자"]).strip()
    if extra:
        insert["extra"] = extra

    _post_task_row(cli, insert)

    out: dict[str, Any] = {
        "id": legacy_id,
        "sheet_row": sheet_row,
        "업무명": title,
    }
    for k in _CREATE_RESPONSE_KEYS:
        if k == "업무명":
            continue
        out[k] = str(fields.get(k, "")).strip()
    if not out.get("외부담당자"):
        for kr in _EXTERNAL_ASSIGNEE_API_KEYS:
            if kr != "외부담당자" and fields.get(kr):
                out["외부담당자"] = str(fields[kr]).strip()
                break
    if not out.get("담당자") and fields.get("담당자"):
        out["담당자"] = str(fields["담당자"]).strip()
    out["업무명"] = title
    out["완료"] = _completed_to_cell(bool(insert.get("completed")))
    if "due_date" in insert:
        out["마감일"] = str(insert["due_date"])
    elif "due_date_raw" in insert:
        out["마감일"] = str(insert["due_date_raw"])
    if "execute_date" in insert:
        out["실행일"] = str(insert["execute_date"])
    elif "execute_date_raw" in insert:
        out["실행일"] = str(insert["execute_date_raw"])
    elif extra.get(_EXECUTE_HEADER):
        out["실행일"] = str(extra[_EXECUTE_HEADER])
    return out


def _patch_body_from_fields(
    fields: dict[str, Any],
    *,
    assignee_col: str = "work_assignee",
    existing_extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    extra = dict(existing_extra or {})
    for kr, dbk in _KOREAN_TO_DB.items():
        if kr in ("업무담당", "외부담당자", "인물담당", "상태", "담당자", "피로도"):
            continue
        if kr not in fields:
            continue
        raw = fields[kr]
        if dbk == "completed":
            b = _bool_from_sheet_val(raw)
            if b is not None:
                patch["completed"] = b
            continue
        if dbk == "due_date":
            s = "" if raw is None else str(raw).strip()
            if not s:
                patch["due_date"] = None
                patch["due_date_raw"] = None
            elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
                patch["due_date"] = s
                patch["due_date_raw"] = None
            else:
                patch["due_date"] = None
                patch["due_date_raw"] = s
            continue
        if dbk == "execute_date":
            patch, extra = _apply_execute_fields(patch, extra, raw)
            continue
        if raw is None or (isinstance(raw, str) and not str(raw).strip()):
            patch[dbk] = None
        else:
            patch[dbk] = str(raw).strip()

    for kr in _EXTERNAL_ASSIGNEE_API_KEYS:
        if kr not in fields:
            continue
        raw = fields[kr]
        s = "" if raw is None else str(raw).strip()
        patch[assignee_col] = s or None
        break

    if "담당자" in fields:
        raw = fields["담당자"]
        s = "" if raw is None else str(raw).strip()
        patch["fatigue"] = s or None

    return patch


def update_task(settings: Settings, task_id: str, fields: dict[str, Any]) -> None:
    cli = _client(settings)
    row = _get_task_by_client_id(cli, task_id)
    if not row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {task_id}")
    tid = row.get("id")
    if not tid:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {task_id}")
    patch = _patch_body_from_fields(
        fields,
        assignee_col=_assignee_write_col(cli),
        existing_extra=_row_extra(row),
    )
    if not patch:
        return
    _patch_task_row(cli, tid, patch)


def delete_task(settings: Settings, task_id: str) -> None:
    cli = _client(settings)
    row = _get_task_by_client_id(cli, task_id)
    if not row:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {task_id}")
    tid = row.get("id")
    if not tid:
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {task_id}")
    cli.delete_json("/tasks", params={"id": f"eq.{tid}"})


def checklist_item_to_payload(item: ChecklistItem) -> dict[str, Any]:
    return {
        "title": item.title,
        "due_date": item.due_date,
        "priority": item.priority,
        "platform": item.platform,
        "category": item.category,
        "work_status": item.work_status,
        "note": item.note,
        "memo": item.memo,
    }


def fetch_checklist_from_supabase(settings: Settings) -> list[ChecklistItem]:
    cli = _client(settings)
    rows = _fetch_tasks(
        cli,
        {
            "completed": "eq.false",
            "order": "sheet_row.asc.nullslast",
        },
    )
    if not isinstance(rows, list):
        return []
    out: list[ChecklistItem] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        it = _db_row_to_checklist_item(row)
        if it:
            out.append(it)
    return out


def fetch_checklist_for_briefing_supabase(
    settings: Settings,
) -> tuple[list[tuple[ChecklistItem, int]], list[str]]:
    cli = _client(settings)
    rows = _fetch_tasks(
        cli,
        {
            "completed": "eq.false",
            "order": "sheet_row.asc.nullslast",
        },
    )
    if not isinstance(rows, list):
        return [], []
    out: list[tuple[ChecklistItem, int]] = []
    warnings: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        it = _db_row_to_checklist_item(row)
        if not it:
            continue
        sr = row.get("sheet_row")
        sheet_n = int(sr) if isinstance(sr, int) and sr >= 2 else None
        if sheet_n is None:
            m = re.match(r"^sheet-row-(\d+)$", it.id, flags=re.I)
            sheet_n = int(m.group(1)) if m else 0
        out.append((it, sheet_n))
    return out, warnings


def create_checklist_item_in_supabase(
    settings: Settings,
    title: str,
    note: str | None,
) -> ChecklistItem:
    _ = note
    t = str(title).strip()
    if not t:
        raise SheetsParseError("[파싱] title이 비어 있습니다.")
    created = create_task(settings, {"업무명": t})
    cli = _client(settings)
    row = _get_task_by_client_id(cli, str(created.get("id", "")))
    if not row:
        raise SheetsParseError("[파싱] 생성된 행을 읽을 수 없습니다.")
    it = _db_row_to_checklist_item(row)
    if not it:
        raise SheetsParseError("[파싱] 생성된 항목 형식이 올바르지 않습니다.")
    return it


def complete_checklist_items_by_ids_supabase(settings: Settings, ids: list[str]) -> int:
    if not ids:
        raise SheetsParseError("[파싱] 완료할 id가 없습니다.")
    cli = _client(settings)
    missing: list[str] = []
    patches: list[tuple[str, dict[str, Any]]] = []
    for raw_id in ids:
        oid = (raw_id or "").strip()
        if not oid:
            missing.append("(빈 id)")
            continue
        row = _get_task_by_client_id(cli, oid)
        if not row or not row.get("id"):
            missing.append(oid)
            continue
        patches.append((str(row["id"]), {"completed": True}))
    if missing:
        shown = missing[:15]
        suffix = " …" if len(missing) > len(shown) else ""
        raise SheetsNotFoundError(
            "[찾을수없음] 시트에 없는 id: " + ", ".join(shown) + suffix
        )
    for tid, body in patches:
        cli.patch_json("/tasks", params={"id": f"eq.{tid}"}, body=body)
    return len(patches)


def update_checklist_item_in_supabase(
    settings: Settings,
    item_id: str,
    title: str,
    note: str | None,
) -> None:
    _ = note
    t = str(title).strip()
    if not t:
        raise SheetsParseError("[파싱] title이 비어 있습니다.")
    cli = _client(settings)
    row = _get_task_by_client_id(cli, item_id.strip())
    if not row or not row.get("id"):
        raise SheetsNotFoundError(
            f"[찾을수없음] 시트에 없거나 이미 완료된 id입니다: {item_id.strip()}"
        )
    if bool(row.get("completed")):
        raise SheetsNotFoundError(
            f"[찾을수없음] 시트에 없거나 이미 완료된 id입니다: {item_id.strip()}"
        )
    cli.patch_json(
        "/tasks",
        params={"id": f"eq.{row['id']}"},
        body={"title": t},
    )


def delete_checklist_row_by_id_supabase(settings: Settings, item_id: str) -> None:
    oid = (item_id or "").strip()
    if not oid:
        raise SheetsParseError("[파싱] id가 비어 있습니다.")
    cli = _client(settings)
    row = _get_task_by_client_id(cli, oid)
    if not row or not row.get("id"):
        raise SheetsNotFoundError(
            f"[찾을수없음] 목록에 없거나 이미 완료된 id입니다: {oid}"
        )
    if bool(row.get("completed")):
        raise SheetsNotFoundError(
            f"[찾을수없음] 목록에 없거나 이미 완료된 id입니다: {oid}"
        )
    cli.delete_json("/tasks", params={"id": f"eq.{row['id']}"})