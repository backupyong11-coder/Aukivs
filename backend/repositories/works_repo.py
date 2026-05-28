"""DATA_BACKEND=supabase 일 때 public.works → GET /works-master 시트 호환 dict."""

from __future__ import annotations

import re
from typing import Any

from config import Settings
from services.sheets_errors import SheetsNotFoundError, SheetsParseError
from services.supabase_client import SupabaseRestClient, SupabaseRequestError, postgrest_eq

# google_master_sheets 주석 A~X 열 순서 + migrate_scripts 의 DB 컬럼명 (표준 헤더 문자열)
_WORKS_HEADER_ORDER: tuple[tuple[str, str], ...] = (
    ("제작완료", "production_done"),
    ("작품명", "title"),
    ("작품분류", "work_genre"),
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
    "id,sheet_row,production_done,title,work_genre,writer,artist,category,format,current_status,"
    "sites_to_upload,launched_sites,pending_sites,contracted_sites,episode_info,"
    "synopsis,characters,copyright,uci,tags,assets_note,staff,age_rating,"
    "first_supply_schedule,serialization_weekday,active_site_count,active_sites,extra"
)

_SELECT_MATRIX = (
    "id,sheet_row,title,work_genre,writer,artist,launched_sites,active_sites,sites_to_upload,"
    "pending_sites,contracted_sites,first_supply_schedule,extra"
)

_SELECT_MATRIX_LEGACY = (
    "id,sheet_row,title,writer,artist,launched_sites,active_sites,sites_to_upload,"
    "pending_sites,contracted_sites,first_supply_schedule,extra"
)

_SELECT_FULL_LEGACY = (
    "id,sheet_row,production_done,title,writer,artist,category,format,current_status,"
    "sites_to_upload,launched_sites,pending_sites,contracted_sites,episode_info,"
    "synopsis,characters,copyright,uci,tags,assets_note,staff,age_rating,"
    "first_supply_schedule,serialization_weekday,active_site_count,active_sites,extra"
)


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


def _merge_work_genre_extra(patch: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    genre = patch.get("work_genre")
    if genre and str(genre).strip():
        extra = {**extra, "작품분류": str(genre).strip()}
    return extra


def _fetch_works_json(cli: SupabaseRestClient, *, select: str, params: dict[str, Any]) -> Any:
    try:
        return cli.get_json("/works", params={**params, "select": select})
    except SupabaseRequestError as exc:
        if not _is_missing_column_error(exc):
            raise
        legacy = _SELECT_FULL_LEGACY if "production_done" in select else _SELECT_MATRIX_LEGACY
        return cli.get_json("/works", params={**params, "select": legacy})


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


def _row_client_id(row: dict[str, Any]) -> str:
    """프론트가 안전하게 참조할 수 있는 안정 ID. sheet_row → UUID 순으로 우선."""
    sr = row.get("sheet_row")
    if isinstance(sr, int) and sr >= 2:
        return f"works-row-{sr}"
    if isinstance(sr, float) and not isinstance(sr, bool) and sr >= 2:
        return f"works-row-{int(sr)}"
    if isinstance(sr, str) and sr.strip().isdigit() and int(sr) >= 2:
        return f"works-row-{int(sr)}"
    rid = row.get("id")
    if rid:
        return str(rid)
    return ""


def _row_to_master_dict(row: dict[str, Any]) -> dict[str, Any]:
    title = str(row.get("title") or "").strip()
    if not title:
        raise ValueError("empty title")

    out: dict[str, Any] = {}
    cid = _row_client_id(row)
    if cid:
        out["id"] = cid
    sr = row.get("sheet_row")
    if isinstance(sr, int) and sr >= 2:
        out["sheet_row"] = sr
    for hdr, col in _WORKS_HEADER_ORDER:
        raw = row.get(col)
        if col == "production_done":
            out[hdr] = bool(raw) if raw is not None else False
        else:
            out[hdr] = _api_cell(raw)

    genre = _work_genre_from_row(row)
    if genre:
        out["작품분류"] = genre

    extra = row.get("extra") or {}
    if not isinstance(extra, dict):
        extra = {}

    _coalesce_canonical_from_extra(out, extra)

    for k in sorted(extra.keys(), key=lambda x: str(x)):
        key = str(k)
        if _cell_has_value(out.get(key)):
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
    out: dict[str, Any] = {}
    cid = _row_client_id(row)
    if cid:
        out["id"] = cid
    out["작품명"] = title
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


def _work_genre_from_row(row: dict[str, Any]) -> Any:
    raw = _api_cell(row.get("work_genre"))
    if raw:
        return raw
    extra = row.get("extra") or {}
    if isinstance(extra, dict):
        for key in ("작품분류", "분류"):
            v = extra.get(key)
            if v is None:
                continue
            s = str(v).strip()
            if s:
                return s
    return None


def _row_to_master_dict_matrix(row: dict[str, Any]) -> dict[str, Any]:
    title = str(row.get("title") or "").strip()
    if not title:
        raise ValueError("empty title")
    out: dict[str, Any] = {}
    cid = _row_client_id(row)
    if cid:
        out["id"] = cid
    out["작품명"] = title
    out["작품분류"] = _work_genre_from_row(row)
    for hdr, col in _WORKS_HEADER_ORDER:
        if col in (
            "title",
            "work_genre",
            "writer",
            "artist",
            "launched_sites",
            "active_sites",
            "sites_to_upload",
            "pending_sites",
            "contracted_sites",
            "first_supply_schedule",
        ):
            if col in ("title", "work_genre"):
                continue
            out[hdr] = _api_cell(row.get(col))
    return out


def list_works_master_items(settings: Settings) -> list[dict[str, Any]]:
    cli = _client(settings)
    rows = _fetch_works_json(
        cli,
        select=_SELECT,
        params={"order": "sheet_row.asc.nullslast,title.asc"},
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
    cli = _client(settings)
    rows = _fetch_works_json(
        cli,
        select=_SELECT_MATRIX,
        params={"order": "title.asc", "limit": "800"},
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

# 플랫폼 서지 CSV(무툰·왓챠·투믹스 등) ↔ 작품정리 헤더 별칭
_WORKS_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "작품명": ("작품명", "제목", "작품 제목"),
    "작품분류": ("작품분류", "분류", "구분"),
    "글작가": ("글작가", "글 작가"),
    "그림작가": ("그림작가", "그림 작가", "대표작가"),
    "분류(일반/성인)": ("분류(일반/성인)", "장르", "성인여부"),
    "형식(웹툰/웹소설 등)": ("형식(웹툰/웹소설 등)", "구분"),
    "현재상태": ("현재상태", "완결여부", "완결 여부"),
    "총화수/시즌정보": ("총화수/시즌정보", "화수", "회차 수", "최종화"),
    "줄거리": ("줄거리", "작품 줄거리"),
    "UCI (구 ISBN)": ("UCI (구 ISBN)", "UCI(ISBN)", "ISBN -> UCI", "ISBN"),
    "연령등급": ("연령등급", "연령\n등급"),
    "첫 공급 일정": ("첫 공급 일정", "서비스 날짜", "예상 공급 일정"),
    "태그": ("태그",),
    "카피라이트": ("카피라이트",),
    "보유에셋/비고": ("보유에셋/비고", "비고"),
    "대여가격": ("대여가격", "대여캐시", "대여가격"),
    "소장가격": ("소장가격", "소장캐시", "투믹스 소장 코인"),
    "무료제공화수": ("무료제공화수", "무료제공", "무료 제공\n화수", "기본 무료회차 구간"),
}


def _cell_has_value(v: object) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return bool(v.strip())
    return True


def _coalesce_canonical_from_extra(out: dict[str, Any], extra: dict[str, Any]) -> None:
    if not isinstance(extra, dict):
        return
    for hdr, col in _WORKS_HEADER_ORDER:
        if col == "production_done":
            continue
        if _cell_has_value(out.get(hdr)):
            continue
        for alias in (hdr, *_WORKS_FIELD_ALIASES.get(hdr, ())):
            if alias not in extra:
                continue
            val = _api_cell(extra.get(alias))
            if val:
                out[hdr] = val
                break


def _normalize_incoming_fields(fields: dict[str, Any]) -> dict[str, Any]:
    """API/시트 별칭 키를 표준 헤더로 정규화."""
    out: dict[str, Any] = dict(fields)
    alias_to_canonical: dict[str, str] = {}
    for canonical, aliases in _WORKS_FIELD_ALIASES.items():
        for alias in aliases:
            alias_to_canonical[alias] = canonical
    for alias, canonical in alias_to_canonical.items():
        if alias in out and canonical not in out:
            out[canonical] = out[alias]
    inferred = _infer_work_genre(out)
    if inferred and not str(out.get("작품분류") or "").strip():
        out["작품분류"] = inferred
    return out


def _infer_work_genre(fields: dict[str, Any]) -> str | None:
    explicit = str(fields.get("작품분류") or "").strip()
    if explicit:
        return explicit
    adult_raw = str(
        fields.get("분류(일반/성인)")
        or fields.get("장르")
        or fields.get("성인여부")
        or ""
    ).strip()
    fmt = str(fields.get("형식(웹툰/웹소설 등)") or fields.get("구분") or "").strip()
    is_bl = "BL" in adult_raw.upper() or "BL" in fmt.upper()
    is_adult = adult_raw.upper() in {"Y", "YES", "성인", "19", "19세", "ADULT"} or "성인" in adult_raw
    if "애니" in fmt:
        return "BL애니" if is_bl else ("성인애니" if is_adult else None)
    if "웹툰" in fmt or fmt == "웹툰":
        return "BL웹툰" if is_bl else ("성인웹툰" if is_adult else None)
    return None


def _mirror_canonical_to_extra(patch: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    """DB 컬럼 미마이그레이션·extra fallback 읽기용 — 표준 필드를 extra 에도 저장."""
    out = dict(extra)
    for hdr, col in _WORKS_HEADER_ORDER:
        if col == "production_done":
            if col in patch:
                out[hdr] = bool(patch[col])
            continue
        if col not in patch:
            continue
        val = patch[col]
        if val is None or (isinstance(val, str) and not val.strip()):
            out.pop(hdr, None)
        else:
            out[hdr] = val
    genre = patch.get("work_genre")
    if genre and str(genre).strip():
        out["작품분류"] = str(genre).strip()
    elif "work_genre" in patch and not genre:
        out.pop("작품분류", None)
    return out


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
    fields = _normalize_incoming_fields(fields)
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


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    flags=re.IGNORECASE,
)
_SHEET_ROW_RE = re.compile(r"^works-row-(\d+)$", flags=re.IGNORECASE)


def _scan_for_title(settings: Settings, title: str) -> dict[str, Any] | None:
    """list_works_master 전체를 가져와서 title을 정규화(공백·NFC) 비교 — eq.이 실패하는 케이스 대비."""
    cli = _client(settings)
    rows = _fetch_works_json(cli, select=_SELECT, params={"order": "sheet_row.asc.nullslast"})
    if not isinstance(rows, list):
        return None
    norm_target = re.sub(r"\s+", " ", title).strip()
    for r in rows:
        if not isinstance(r, dict):
            continue
        t = str(r.get("title") or "")
        if re.sub(r"\s+", " ", t).strip() == norm_target:
            return r
    return None


def _get_by_title(settings: Settings, title: str) -> dict[str, Any]:
    cli = _client(settings)
    rows = _fetch_works_json(
        cli,
        select=_SELECT,
        params={"title": postgrest_eq(title), "limit": "1"},
    )
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return rows[0]
    rows = _fetch_works_json(
        cli,
        select=_SELECT,
        params={"title": f"eq.{title}", "limit": "1"},
    )
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return rows[0]
    scanned = _scan_for_title(settings, title)
    if scanned is not None:
        return scanned
    raise SheetsNotFoundError(f"[찾을수없음] 작품명 없음: {title}")


def _get_row_by_client_id(settings: Settings, client_id: str) -> dict[str, Any]:
    """UUID / works-row-{n} / title 순으로 조회."""
    cid = (client_id or "").strip()
    if not cid:
        raise SheetsNotFoundError("[찾을수없음] 작품 id가 비어 있습니다.")
    cli = _client(settings)
    if _UUID_RE.match(cid):
        rows = _fetch_works_json(
            cli, select=_SELECT, params={"id": f"eq.{cid}", "limit": "1"}
        )
        if isinstance(rows, list) and rows and isinstance(rows[0], dict):
            return rows[0]
    m = _SHEET_ROW_RE.match(cid)
    if m:
        n = int(m.group(1))
        rows = _fetch_works_json(
            cli, select=_SELECT, params={"sheet_row": f"eq.{n}", "limit": "1"}
        )
        if isinstance(rows, list) and rows and isinstance(rows[0], dict):
            return rows[0]
    return _get_by_title(settings, cid)


def _post_works_row(cli: SupabaseRestClient, patch: dict[str, Any]) -> list[Any]:
    remaining = dict(patch)
    last_exc: SupabaseRequestError | None = None
    for _ in range(max(1, len(remaining) + 1)):
        if not remaining:
            raise SheetsParseError("Supabase works.create 응답 없음")
        try:
            rows = cli.post_json("/works", remaining, prefer="return=representation")
            if not isinstance(rows, list):
                raise SheetsParseError("Supabase works.create 응답 없음")
            return rows
        except SupabaseRequestError as exc:
            if not _is_missing_column_error(exc):
                raise
            last_exc = exc
            msg = str(exc).lower()
            removed = False
            for col in list(remaining.keys()):
                if col in ("extra", "title", "sheet_row", "id"):
                    continue
                if col.replace("_", " ") in msg or col in msg:
                    hdr = next((h for h, c in _WORKS_HEADER_ORDER if c == col), col)
                    extra = remaining.get("extra")
                    if not isinstance(extra, dict):
                        extra = {}
                    val = remaining.pop(col)
                    if val is not None and str(val).strip():
                        extra[hdr] = str(val).strip()
                    remaining["extra"] = extra
                    removed = True
                    break
            if not removed and "work_genre" in remaining:
                val = remaining.pop("work_genre")
                extra = remaining.get("extra")
                if not isinstance(extra, dict):
                    extra = {}
                if val is not None and str(val).strip():
                    extra["작품분류"] = str(val).strip()
                remaining["extra"] = extra
                continue
            if not removed:
                raise
    if last_exc:
        raise last_exc
    raise SheetsParseError("Supabase works.create 응답 없음")


def _patch_works_row(cli: SupabaseRestClient, row_id: object, patch: dict[str, Any]) -> None:
    remaining = dict(patch)
    last_exc: SupabaseRequestError | None = None
    for _ in range(max(1, len(remaining) + 1)):
        if not remaining:
            return
        try:
            cli.patch_json("/works", params={"id": f"eq.{row_id}"}, body=remaining)
            return
        except SupabaseRequestError as exc:
            if not _is_missing_column_error(exc):
                raise
            last_exc = exc
            msg = str(exc).lower()
            removed = False
            for col in list(remaining.keys()):
                if col in ("extra", "title", "sheet_row", "id"):
                    continue
                if col.replace("_", " ") in msg or col in msg:
                    hdr = next((h for h, c in _WORKS_HEADER_ORDER if c == col), col)
                    extra = remaining.get("extra")
                    if not isinstance(extra, dict):
                        extra = {}
                    val = remaining.pop(col)
                    if val is not None and str(val).strip():
                        extra[hdr] = str(val).strip()
                    remaining["extra"] = extra
                    removed = True
                    break
            if not removed and "work_genre" in remaining:
                val = remaining.pop("work_genre")
                extra = remaining.get("extra")
                if not isinstance(extra, dict):
                    extra = {}
                if val is not None and str(val).strip():
                    extra["작품분류"] = str(val).strip()
                remaining["extra"] = extra
                continue
            if not removed:
                raise
    if last_exc:
        raise last_exc


def create_works_master_row(settings: Settings, fields: dict[str, Any]) -> dict[str, Any]:
    fields = _normalize_incoming_fields(fields)
    title = str(fields.get("작품명", "")).strip()
    if not title:
        raise SheetsParseError("[파싱] 작품명이 비어 있습니다.")
    patch, extra = _fields_to_db_patch(fields)
    patch["title"] = title
    patch["extra"] = _mirror_canonical_to_extra(patch, _merge_work_genre_extra(patch, extra))
    n = _next_sheet_row(settings)
    patch["sheet_row"] = n
    cli = _client(settings)
    rows = _post_works_row(cli, patch)
    if not rows:
        raise SheetsParseError("Supabase works.create 응답 없음")
    return _row_to_master_dict(rows[0])


def update_works_master_row(
    settings: Settings,
    original_title: str,
    fields: dict[str, Any],
    *,
    client_id: str | None = None,
) -> None:
    cid = (client_id or "").strip()
    orig = (original_title or "").strip()
    if not cid and not orig:
        raise SheetsParseError("[파싱] 원본 작품 id 또는 원본 작품명이 필요합니다.")
    fields = _normalize_incoming_fields(fields)
    current = _get_row_by_client_id(settings, cid) if cid else _get_by_title(settings, orig)
    row_id = current.get("id")
    if not row_id:
        raise SheetsNotFoundError(
            f"[찾을수없음] 작품 id 없음: {cid or orig}"
        )
    patch, extra_in = _fields_to_db_patch(fields)
    base_ex = current.get("extra") or {}
    if not isinstance(base_ex, dict):
        base_ex = {}
    merged_ex = _mirror_canonical_to_extra(
        patch,
        _merge_work_genre_extra(patch, {**base_ex, **extra_in}),
    )
    for k in list(merged_ex.keys()):
        if k in fields and (fields[k] is None or str(fields[k]).strip() == ""):
            merged_ex.pop(k, None)
    patch["extra"] = merged_ex
    new_title = str(fields.get("작품명", "")).strip()
    if new_title:
        patch["title"] = new_title
    if not patch:
        return
    _patch_works_row(_client(settings), row_id, patch)


def delete_works_master_row(
    settings: Settings,
    *,
    client_id: str | None = None,
    original_title: str | None = None,
) -> None:
    cid = (client_id or "").strip()
    orig = (original_title or "").strip()
    if not cid and not orig:
        raise SheetsParseError("[파싱] 작품 id 또는 작품명이 필요합니다.")
    current = _get_row_by_client_id(settings, cid) if cid else _get_by_title(settings, orig)
    row_id = current.get("id")
    if not row_id:
        raise SheetsNotFoundError(f"[찾을수없음] 작품 id 없음: {cid or orig}")
    _client(settings).delete_json("/works", params={"id": f"eq.{row_id}"})
