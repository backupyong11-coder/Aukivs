"""DATA_BACKEND=supabase 일 때 public.works → GET /works-master 시트 호환 dict."""

from __future__ import annotations

from typing import Any

from config import Settings
from services.sheets_errors import SheetsNotFoundError, SheetsParseError
from services.supabase_client import SupabaseRestClient
from services.sheets_errors import SheetsParseError

# google_master_sheets 주석 A~X 열 순서 + migrate_scripts 의 DB 컬럼명 (표준 헤더 문자열)
_WORKS_HEADER_ORDER: tuple[tuple[str, str], ...] = (
    ("제작완료", "production_done"),
    ("작품명", "title"),
    ("글작가", "writer"),
    ("그림작가", "artist"),
    ("분류(일반/성인)", "category"),
    ("형식(웹툰/웹소설 등)", "format"),
    ("현재상태", "current_status"),
    ("업로드해야 하는 사이트", "sites_to_upload"),
    ("런칭된 사이트", "launched_sites"),
    ("대기중 사이트", "pending_sites"),
    ("계약된 사이트", "contracted_sites"),
    ("총화수/시즌정보", "episode_info"),
    ("줄거리", "synopsis"),
    ("캐릭터", "characters"),
    ("카피라이트", "copyright"),
    ("UCI (구 ISBN)", "uci"),
    ("태그", "tags"),
    ("보유에셋/비고", "assets_note"),
    ("스태프", "staff"),
    ("연령등급", "age_rating"),
    ("첫 공급 일정", "first_supply_schedule"),
    ("연재요일", "serialization_weekday"),
    ("연재중인 곳 갯수", "active_site_count"),
    ("연재중인 사이트", "active_sites"),
)

_CANONICAL_HEADERS: frozenset[str] = frozenset(h for h, _ in _WORKS_HEADER_ORDER)

_SELECT = (
    "production_done,title,writer,artist,category,format,current_status,"
    "sites_to_upload,launched_sites,pending_sites,contracted_sites,episode_info,"
    "synopsis,characters,copyright,uci,tags,assets_note,staff,age_rating,"
    "first_supply_schedule,serialization_weekday,active_site_count,active_sites,extra"
)

_SELECT_MATRIX = (
    "title,writer,artist,launched_sites,active_sites,sites_to_upload,"
    "pending_sites,contracted_sites,first_supply_schedule"
)

_SELECT_SLIM = (
    "title,writer,artist,current_status,active_sites,launched_sites,first_supply_schedule"
)


def _client(settings: Settings) -> SupabaseRestClient:
    return SupabaseRestClient(
        settings.supabase_url or "",
        settings.supabase_service_role_key or "",
    )


def _api_cell(v: object) -> Any:
    """google_master_sheets._cell_to_json 과 유사하게 빈 값은 null."""
    if v is None:
        return None
    if isinstance(v, str):
        return None if not v.strip() else v.strip()
    if isinstance(v, bool):
        return v
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v) if v.is_integer() else v
    if isinstance(v, dict):
        return v if v else None
    if isinstance(v, list):
        return v if v else None
    s = str(v).strip()
    return None if not s else s


def _row_to_master_dict(row: dict[str, Any]) -> dict[str, Any]:
    title = str(row.get("title") or "").strip()
    if not title:
        raise ValueError("empty title")

    out: dict[str, Any] = {}
    for hdr, col in _WORKS_HEADER_ORDER:
        raw = row.get(col)
        if col == "production_done":
            out[hdr] = bool(raw) if raw is not None else False
        else:
            out[hdr] = _api_cell(raw)

    extra = row.get("extra") or {}
    if not isinstance(extra, dict):
        extra = {}

    for k in sorted(extra.keys(), key=lambda x: str(x)):
        key = str(k)
        if key in out:
            continue
        if key in _CANONICAL_HEADERS:
            continue
        v = extra[k]
        if v is None:
            out[key] = None
        elif isinstance(v, dict):
            out[key] = v if v else None
        elif isinstance(v, list):
            out[key] = v if v else None
        elif isinstance(v, str):
            out[key] = None if not v.strip() else v.strip()
        elif isinstance(v, (int, float, bool)):
            out[key] = v
        else:
            s = str(v).strip()
            out[key] = None if not s else s

    return out


def _rows_to_master_items(rows: list[Any], *, full: bool) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for r in rows:
        if not isinstance(r, dict):
            continue
        tkey = str(r.get("title") or "").strip()
        if not tkey:
            continue
        if tkey in seen_titles:
            continue
        seen_titles.add(tkey)
        try:
            if full:
                items.append(_row_to_master_dict(r))
            else:
                items.append(_row_to_master_dict_slim(r))
        except ValueError:
            continue
    return items


def _row_to_master_dict_slim(row: dict[str, Any]) -> dict[str, Any]:
    """챗봇·경량 목록용 — 사이트·작품명 위주."""
    title = str(row.get("title") or "").strip()
    if not title:
        raise ValueError("empty title")
    out: dict[str, Any] = {"작품명": title}
    slim_map = (
        ("글작가", "writer"),
        ("그림작가", "artist"),
        ("현재상태", "current_status"),
        ("연재중인 사이트", "active_sites"),
        ("런칭된 사이트", "launched_sites"),
        ("첫 공급 일정", "first_supply_schedule"),
    )
    for hdr, col in slim_map:
        out[hdr] = _api_cell(row.get(col))
    return out


def _row_to_master_dict_matrix(row: dict[str, Any]) -> dict[str, Any]:
    title = str(row.get("title") or "").strip()
    if not title:
        raise ValueError("empty title")
    out: dict[str, Any] = {"작품명": title}
    for hdr, col in _WORKS_HEADER_ORDER:
        if col in (
            "title",
            "writer",
            "artist",
            "launched_sites",
            "active_sites",
            "sites_to_upload",
            "pending_sites",
            "contracted_sites",
            "first_supply_schedule",
        ):
            if col == "title":
                continue
            out[hdr] = _api_cell(row.get(col))
    return out


def list_works_master_items(settings: Settings) -> list[dict[str, Any]]:
    rows = _client(settings).get_json(
        "/works",
        params={
            "select": _SELECT,
            "order": "sheet_row.asc.nullslast,title.asc",
        },
    )
    if not isinstance(rows, list):
        raise SheetsParseError("Supabase works 응답 형식 오류")
    return _rows_to_master_items(rows, full=True)


def list_works_master_slim(settings: Settings, *, limit: int = 60) -> list[dict[str, Any]]:
    rows = _client(settings).get_json(
        "/works",
        params={
            "select": _SELECT_SLIM,
            "order": "title.asc",
            "limit": str(max(1, int(limit))),
        },
    )
    if not isinstance(rows, list):
        return []
    return _rows_to_master_items(rows, full=False)


def list_works_master_for_matrix(settings: Settings) -> list[dict[str, Any]]:
    rows = _client(settings).get_json(
        "/works",
        params={
            "select": _SELECT_MATRIX,
            "order": "title.asc",
            "limit": "800",
        },
    )
    if not isinstance(rows, list):
        return []
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in rows:
        if not isinstance(r, dict):
            continue
        tkey = str(r.get("title") or "").strip()
        if not tkey or tkey in seen:
            continue
        seen.add(tkey)
        try:
            items.append(_row_to_master_dict_matrix(r))
        except ValueError:
            continue
    return items


_HEADER_TO_COLUMN: dict[str, str] = {h: c for h, c in _WORKS_HEADER_ORDER}


def _next_sheet_row(settings: Settings) -> int:
    rows = _client(settings).get_json(
        "/works",
        params={"select": "sheet_row", "order": "sheet_row.desc", "limit": "1"},
    )
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        n = rows[0].get("sheet_row")
        if isinstance(n, int) and n >= 1:
            return n + 1
    return 2


def _fields_to_db_patch(fields: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    patch: dict[str, Any] = {}
    extra: dict[str, Any] = {}
    for k, v in fields.items():
        kr = str(k).strip()
        if not kr or kr == "id":
            continue
        s = "" if v is None else str(v).strip()
        col = _HEADER_TO_COLUMN.get(kr)
        if col == "production_done":
            patch[col] = s.upper() in ("TRUE", "1", "YES", "Y", "O", "✓")
        elif col:
            patch[col] = s if s else None
        elif s:
            extra[kr] = s
    return patch, extra


def _get_by_title(settings: Settings, title: str) -> dict[str, Any]:
    rows = _client(settings).get_json(
        "/works",
        params={"select": _SELECT, "title": f"eq.{title}", "limit": "1"},
    )
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        raise SheetsNotFoundError(f"[찾을수없음] 작품명 없음: {title}")
    return rows[0]


def create_works_master_row(settings: Settings, fields: dict[str, Any]) -> dict[str, Any]:
    title = str(fields.get("작품명", "")).strip()
    if not title:
        raise SheetsParseError("[파싱] 작품명이 비어 있습니다.")
    patch, extra = _fields_to_db_patch(fields)
    patch["title"] = title
    patch["extra"] = extra
    n = _next_sheet_row(settings)
    patch["sheet_row"] = n
    rows = _client(settings).post_json(
        "/works", patch, prefer="return=representation"
    )
    if not isinstance(rows, list) or not rows:
        raise SheetsParseError("Supabase works.create 응답 없음")
    return _row_to_master_dict(rows[0])


def update_works_master_row(
    settings: Settings, original_title: str, fields: dict[str, Any]
) -> None:
    orig = original_title.strip()
    if not orig:
        raise SheetsParseError("[파싱] 원본 작품명이 비어 있습니다.")
    current = _get_by_title(settings, orig)
    row_id = current.get("id")
    if not row_id:
        raise SheetsNotFoundError(f"[찾을수없음] 작품 id 없음: {orig}")
    patch, extra_in = _fields_to_db_patch(fields)
    base_ex = current.get("extra") or {}
    if not isinstance(base_ex, dict):
        base_ex = {}
    merged_ex = {**base_ex, **extra_in}
    for k in list(merged_ex.keys()):
        if k in fields and (fields[k] is None or str(fields[k]).strip() == ""):
            merged_ex.pop(k, None)
    if patch or extra_in or merged_ex != base_ex:
        patch["extra"] = merged_ex
    new_title = str(fields.get("작품명", "")).strip()
    if new_title:
        patch["title"] = new_title
    if not patch:
        return
    _client(settings).patch_json("/works", params={"id": f"eq.{row_id}"}, body=patch)
