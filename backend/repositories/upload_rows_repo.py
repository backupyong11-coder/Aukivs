"""DATA_BACKEND=supabase 일 때 public.upload_rows + /upload-rows API 호환."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from config import Settings
from schemas import UploadItem
from services.google_upload_rows_sheets import _FIELD_KEYS_ORDER
from services.supabase_client import SupabaseRestClient
from services.sheets_errors import SheetsNotFoundError, SheetsParseError

_SELECT = (
    "id,legacy_id,sheet_row,completed,upload_date,upload_date_raw,platform_name,work_title,"
    "uploaded_episodes,remaining_episodes,upload_status,upload_cycle,upload_weekday,"
    "upload_method,launch_date,launch_date_raw,last_upload_date,last_upload_date_raw,"
    "next_upload_date,next_upload_date_raw,manuscript_ready,upload_link,last_upload_episode,note"
)


def _client(settings: Settings) -> SupabaseRestClient:
    return SupabaseRestClient(
        settings.supabase_url or "",
        settings.supabase_service_role_key or "",
    )


def _truthy(v: object) -> bool:
    s = str(v).strip().upper()
    return s in ("TRUE", "1", "YES", "Y", "✓", "완료")


def _opt_int(v: object) -> int | None:
    s = str(v).strip() if v is not None else ""
    if not s or s in ("-", "없음"):
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def _fmt_date_col(d: object | None, raw: object | None) -> str:
    if isinstance(d, date):
        return d.isoformat()
    if d is not None and str(d).strip():
        return str(d).strip()
    if raw is not None and str(raw).strip():
        return str(raw).strip()
    return ""


def _opt_episode_cell(v: object | None) -> str:
    n = _opt_int(v)
    return "" if n is None else str(n)


def _set_date_pair(
    target: dict[str, Any],
    date_key: str,
    raw_key: str,
    raw_val: object,
) -> None:
    s = "" if raw_val is None else str(raw_val).strip()
    if not s:
        target[date_key] = None
        target[raw_key] = None
        return
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        target[date_key] = s
        target[raw_key] = None
    else:
        target[date_key] = None
        target[raw_key] = s


def _api_dict(r: dict[str, Any]) -> dict[str, Any]:
    rid = r.get("id")
    legacy_id = (r.get("legacy_id") or "").strip()
    sr_raw = r.get("sheet_row")
    if isinstance(sr_raw, (int, float)) and not isinstance(sr_raw, bool):
        sheet_row: int | None = int(sr_raw)
    elif isinstance(sr_raw, str) and sr_raw.strip().isdigit():
        sheet_row = int(sr_raw.strip())
    else:
        sheet_row = None

    if sheet_row is not None and sheet_row >= 2:
        out_id = f"upload-row-{sheet_row}"
    elif legacy_id:
        out_id = legacy_id
    else:
        out_id = str(rid or "")

    return {
        "id": out_id,
        "sheet_row": sheet_row,
        "완료": ("TRUE" if r.get("completed") else ""),
        "업로드일": _fmt_date_col(r.get("upload_date"), r.get("upload_date_raw")),
        "플랫폼명": (r.get("platform_name") or ""),
        "작품명": (r.get("work_title") or ""),
        "업로드화수": _opt_episode_cell(r.get("uploaded_episodes")),
        "남은업로드화수": _opt_episode_cell(r.get("remaining_episodes")),
        "업로드완료여부": (r.get("upload_status") or ""),
        "업로드주기": (r.get("upload_cycle") or ""),
        "업로드요일": (r.get("upload_weekday") or ""),
        "업로드방식": (r.get("upload_method") or ""),
        "런칭일": _fmt_date_col(r.get("launch_date"), r.get("launch_date_raw")),
        "마지막업로드일": _fmt_date_col(
            r.get("last_upload_date"), r.get("last_upload_date_raw")
        ),
        "다음업로드일": _fmt_date_col(
            r.get("next_upload_date"), r.get("next_upload_date_raw")
        ),
        "원고준비": (r.get("manuscript_ready") or ""),
        "업로드링크": (r.get("upload_link") or ""),
        "마지막업로드회수": (r.get("last_upload_episode") or ""),
        "비고": (r.get("note") or ""),
        "다음업로드회수": "",
    }


def list_upload_rows(settings: Settings) -> list[dict[str, Any]]:
    rows = _client(settings).get_json(
        "/upload_rows",
        params={
            "select": _SELECT,
            "order": "sheet_row.asc.nullslast",
        },
    )
    if not isinstance(rows, list):
        raise SheetsParseError("Supabase upload_rows 응답 형식 오류")
    out: list[dict[str, Any]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        d = _api_dict(r)
        if not str(d.get("작품명") or "").strip():
            continue
        out.append(d)
    return out


def _get_row_or_raise(
    settings: Settings,
    client_id: str,
) -> tuple[str, dict[str, Any]]:
    """(uuid, row). client_id = upload-row-N, legacy_id, 또는 uuid."""
    cid = str(client_id).strip()
    if not cid:
        raise SheetsNotFoundError("[찾을수없음] id가 비어 있습니다.")
    cl = _client(settings)
    # uuid
    if re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", cid, re.I
    ):
        rows = cl.get_json(
            "/upload_rows",
            params={"select": _SELECT, "id": f"eq.{cid}", "limit": "1"},
        )
        if isinstance(rows, list) and rows:
            return str(rows[0]["id"]), rows[0]
        raise SheetsNotFoundError(f"[찾을수없음] id 없음: {cid}")
    # upload-row-N / sheet_row
    m = re.fullmatch(r"upload-row-(\d+)", cid, re.I)
    if m:
        n = int(m.group(1))
        rows = cl.get_json(
            "/upload_rows",
            params={"select": _SELECT, "sheet_row": f"eq.{n}", "limit": "1"},
        )
        if isinstance(rows, list) and rows:
            return str(rows[0]["id"]), rows[0]
    # legacy_id
    rows = cl.get_json(
        "/upload_rows",
        params={"select": _SELECT, "legacy_id": f"eq.{cid}", "limit": "1"},
    )
    if isinstance(rows, list) and rows:
        return str(rows[0]["id"]), rows[0]
    raise SheetsNotFoundError(f"[찾을수없음] id 없음: {cid}")


def _next_sheet_row(settings: Settings) -> int:
    rows = _client(settings).get_json(
        "/upload_rows",
        params={
            "select": "sheet_row",
            "order": "sheet_row.desc.nullslast",
            "limit": "1",
        },
    )
    if isinstance(rows, list) and rows:
        sr = rows[0].get("sheet_row")
        if isinstance(sr, int):
            return sr + 1
    return 2


def _insert_body_from_fields(fields: dict[str, Any]) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if "완료" in fields:
        body["completed"] = bool(_truthy(fields.get("완료")))
    if "업로드일" in fields:
        _set_date_pair(
            body, "upload_date", "upload_date_raw", fields.get("업로드일")
        )
    if "플랫폼명" in fields:
        body["platform_name"] = (
            str(fields.get("플랫폼명") or "").strip() or None
        )
    if "작품명" in fields:
        body["work_title"] = str(fields.get("작품명") or "").strip() or None
    if "업로드화수" in fields:
        body["uploaded_episodes"] = _opt_int(fields.get("업로드화수"))
    if "남은업로드화수" in fields:
        body["remaining_episodes"] = _opt_int(fields.get("남은업로드화수"))
    if "업로드완료여부" in fields:
        body["upload_status"] = (
            str(fields.get("업로드완료여부") or "").strip() or None
        )
    if "업로드주기" in fields:
        body["upload_cycle"] = (
            str(fields.get("업로드주기") or "").strip() or None
        )
    if "업로드요일" in fields:
        body["upload_weekday"] = (
            str(fields.get("업로드요일") or "").strip() or None
        )
    if "업로드방식" in fields:
        body["upload_method"] = (
            str(fields.get("업로드방식") or "").strip() or None
        )
    if "런칭일" in fields:
        _set_date_pair(
            body, "launch_date", "launch_date_raw", fields.get("런칭일")
        )
    if "마지막업로드일" in fields:
        _set_date_pair(
            body,
            "last_upload_date",
            "last_upload_date_raw",
            fields.get("마지막업로드일"),
        )
    if "다음업로드일" in fields:
        _set_date_pair(
            body,
            "next_upload_date",
            "next_upload_date_raw",
            fields.get("다음업로드일"),
        )
    if "원고준비" in fields:
        body["manuscript_ready"] = (
            str(fields.get("원고준비") or "").strip() or None
        )
    if "업로드링크" in fields:
        body["upload_link"] = (
            str(fields.get("업로드링크") or "").strip() or None
        )
    if "마지막업로드회수" in fields:
        body["last_upload_episode"] = (
            str(fields.get("마지막업로드회수") or "").strip() or None
        )
    if "비고" in fields:
        body["note"] = str(fields.get("비고") or "").strip() or None
    return body


def create_upload_row(settings: Settings, fields: dict[str, Any]) -> dict[str, Any]:
    wt = str(fields.get("작품명", "")).strip()
    if not wt:
        raise SheetsParseError("[파싱] 작품명은 비울 수 없습니다.")

    n = _next_sheet_row(settings)
    legacy_id = f"upload-row-{n}"
    insert: dict[str, Any] = {
        "legacy_id": legacy_id,
        "sheet_row": n,
        **_insert_body_from_fields(fields),
    }
    insert["work_title"] = wt

    rows = _client(settings).post_json(
        "/upload_rows", insert, prefer="return=representation"
    )
    if not isinstance(rows, list) or not rows:
        raise SheetsParseError("Supabase upload_rows 생성 응답 없음")
    api = _api_dict(rows[0])
    # Google Sheets create_upload_row 와 동일한 필드 순서
    ordered: dict[str, Any] = {
        "id": api["id"],
        "sheet_row": api["sheet_row"],
        "작품명": api["작품명"],
        "다음업로드회수": "",
    }
    for k in _FIELD_KEYS_ORDER:
        if k == "작품명":
            continue
        ordered[k] = api.get(k, "")
    return ordered


def _briefing_uploaded_at_from_cell(업로드일: object) -> str:
    """브리핑 집계(UploadItem.uploaded_at)용 ISO 유사 문자열."""
    s = "" if 업로드일 is None else str(업로드일).strip()
    if not s:
        return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return f"{s}T00:00:00+09:00"
    return s


def _briefing_sheet_row_from_api_dict(d: dict[str, Any]) -> int:
    sr = d.get("sheet_row")
    if isinstance(sr, (int, float)) and not isinstance(sr, bool):
        n = int(sr)
        if n >= 2:
            return n
    m = re.fullmatch(r"upload-row-(\d+)", str(d.get("id") or "").strip(), re.I)
    if m:
        return max(2, int(m.group(1)))
    return 2


def fetch_upload_rows_for_briefing_supabase(
    settings: Settings,
) -> tuple[list[tuple[UploadItem, int]], list[str]]:
    """
    DATA_BACKEND=supabase 일 때 브리핑의 '업로드' 축을 레거시 업로드운영 탭 대신
    public.upload_rows(업로드정리)로 채운다. UploadItem은 aggregate_briefing_today 스키마용.
    """
    rows = list_upload_rows(settings)
    out: list[tuple[UploadItem, int]] = []
    for d in rows:
        title = str(d.get("작품명") or "").strip()
        if not title:
            continue
        oid = str(d.get("id") or "").strip()
        if not oid:
            continue
        uploaded_at = _briefing_uploaded_at_from_cell(d.get("업로드일"))
        status_raw = d.get("업로드완료여부")
        status = None if status_raw is None or str(status_raw).strip() == "" else str(status_raw).strip()
        note_raw = d.get("비고")
        note = None if note_raw is None or str(note_raw).strip() == "" else str(note_raw).strip()
        plat = str(d.get("플랫폼명") or "").strip()
        file_name = plat if plat else ""
        item = UploadItem(
            id=oid,
            title=title,
            file_name=file_name,
            uploaded_at=uploaded_at if uploaded_at else "",
            note=note,
            status=status,
        )
        out.append((item, _briefing_sheet_row_from_api_dict(d)))
    return out, []


def update_upload_row(
    settings: Settings, client_id: str, fields: dict[str, Any]
) -> None:
    row_id, _ = _get_row_or_raise(settings, client_id)
    patch = _insert_body_from_fields(fields)
    if not patch:
        return
    _client(settings).patch_json(
        "/upload_rows", params={"id": f"eq.{row_id}"}, body=patch
    )


def delete_upload_row(settings: Settings, client_id: str) -> None:
    row_id, _ = _get_row_or_raise(settings, client_id)
    _client(settings).delete_json(
        "/upload_rows", params={"id": f"eq.{row_id}"}
    )

