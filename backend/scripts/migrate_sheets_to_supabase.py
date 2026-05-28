#!/usr/bin/env python3
"""
Google Sheets → Supabase 1회 이관 (읽기 전용).

- Sheets: 기존 google_*_sheets.fetch_* 만 사용 (쓰기 없음)
- Supabase: legacy_id 기준 UPSERT (service role)
- 기본: dry-run (--execute 시에만 INSERT/UPDATE)

실행 (backend 디렉터리에서):
  python scripts/migrate_sheets_to_supabase.py
  python scripts/migrate_sheets_to_supabase.py --execute
  python scripts/migrate_sheets_to_supabase.py --table tasks --limit 5 --execute
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import traceback
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


# ---------------------------------------------------------------------------
# Console / logging (한글·UTF-8 안전; Windows 기본 스트림 ascii 방지)
# ---------------------------------------------------------------------------


def _configure_runtime_io() -> None:
    """stdout/stderr UTF-8 + 로깅 핸들러 정리. import 이후· Sheets 호출 전에 실행."""
    for stream in (sys.stdout, sys.stderr):
        if stream is None:
            continue
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (OSError, ValueError, AttributeError):
                pass

    root = logging.getLogger()
    for h in root.handlers[:]:
        root.removeHandler(h)
    sh = logging.StreamHandler(sys.stderr)
    sh.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    root.addHandler(sh)
    root.setLevel(logging.INFO)


def safe_print(*args: object, sep: str = " ", end: str = "\n", file: Any = None) -> None:
    """한글 출력·Windows 콘솔에서 UnicodeEncodeError 시 바이너리 버퍼로 UTF-8 대체."""
    out = file if file is not None else sys.stdout
    text = sep.join(str(a) for a in args) + end
    try:
        out.write(text)
        if hasattr(out, "flush"):
            out.flush()
    except UnicodeEncodeError:
        buf = getattr(out, "buffer", None)
        if buf is not None and not buf.closed:
            buf.write(text.encode("utf-8", errors="replace"))
            buf.flush()

from config import Settings, load_settings  # noqa: E402
from services.google_master_sheets import (  # noqa: E402
    _cell_to_json,
    _header_keys,
    _row_all_blank,
)
from services.google_memo_sheets import fetch_memos_from_google_sheets  # noqa: E402
from services.google_platform_rows_sheets import fetch_platforms  # noqa: E402
from services.google_sheets import read_sheet_tab_values, spreadsheet_id_from_url  # noqa: E402
from services.google_tasks_sheets import fetch_tasks  # noqa: E402
from services.google_upload_rows_sheets import fetch_upload_rows  # noqa: E402

_SEOUL = ZoneInfo("Asia/Seoul")
_TABLES = ("tasks", "upload_rows", "platform_rows", "memos", "works")
_UPSERT_BATCH = 100

# platform_rows: 시트 헤더(한글) → DB 컬럼에 매핑된 키 (나머지는 extra)
_PLATFORM_CORE_SHEET_HEADERS: frozenset[str] = frozenset(
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

# works: 시트 헤더 → DB 컬럼 (정확 일치 우선, 없으면 extra)
_WORKS_HEADER_TO_COLUMN: dict[str, str] = {
    "제작완료": "production_done",
    "작품명": "title",
    "글작가": "writer",
    "그림작가": "artist",
    "분류(일반/성인)": "category",
    "분류": "category",
    "형식(웹툰/웹소설 등)": "format",
    "형식": "format",
    "현재상태": "current_status",
    "업로드해야 하는 사이트": "sites_to_upload",
    "런칭된 사이트": "launched_sites",
    "대기중 사이트": "pending_sites",
    "계약된 사이트": "contracted_sites",
    "총화수/시즌정보": "episode_info",
    "줄거리": "synopsis",
    "캐릭터": "characters",
    "카피라이트": "copyright",
    "UCI (구 ISBN)": "uci",
    "UCI": "uci",
    "태그": "tags",
    "보유에셋/비고": "assets_note",
    "스태프": "staff",
    "연령등급": "age_rating",
    "첫 공급 일정": "first_supply_schedule",
    "연재요일": "serialization_weekday",
    "연재중인 곳 갯수": "active_site_count",
    "연재중인 사이트": "active_sites",
}

_WORKS_DB_COLUMNS: frozenset[str] = frozenset(_WORKS_HEADER_TO_COLUMN.values())

# Supabase public.works — PostgREST upsert 시 각 객체의 키 집합이 동일해야 함 (id/created_at/updated_at 제외)
_WORKS_UPSERT_COLUMNS: tuple[str, ...] = (
    "legacy_id",
    "sheet_row",
    "production_done",
    "title",
    "writer",
    "artist",
    "category",
    "format",
    "current_status",
    "sites_to_upload",
    "launched_sites",
    "pending_sites",
    "contracted_sites",
    "episode_info",
    "synopsis",
    "characters",
    "copyright",
    "uci",
    "tags",
    "assets_note",
    "staff",
    "age_rating",
    "first_supply_schedule",
    "serialization_weekday",
    "active_site_count",
    "active_sites",
    "extra",
)
_WORKS_UPSERT_KEY_SET: frozenset[str] = frozenset(_WORKS_UPSERT_COLUMNS)

# 시트 2행째 중복 헤더 등: 작품명 칸이 헤더 레이블과 같으면 데이터 행으로 보지 않음
_WORKS_TITLE_HEADER_MARKERS: frozenset[str] = frozenset(
    {"작품명", "title", "TITLE", "Title", "작품"}
)


# ---------------------------------------------------------------------------
# Parsing helpers (never raise to caller)
# ---------------------------------------------------------------------------


def _s(v: object) -> str:
    if v is None:
        return ""
    return str(v).strip()


def parse_bool(v: object) -> bool:
    s = _s(v).upper()
    return s in ("TRUE", "1", "YES", "Y", "O", "✓", "완료")


def parse_int(v: object) -> int | None:
    s = _s(v)
    if not s or s in ("-", "없음"):
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def parse_date(v: object) -> tuple[date | None, str | None]:
    """Returns (parsed date, raw to keep when parse fails or empty)."""
    raw = _s(v)
    if not raw or raw in ("-", "없음"):
        return None, raw or None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        try:
            return date.fromisoformat(raw), None
        except ValueError:
            return None, raw
    # Try datetime → date
    ts = parse_timestamptz(v)
    if ts is not None:
        return ts.date(), None
    return None, raw


def parse_timestamptz(v: object) -> datetime | None:
    raw = _s(v)
    if not raw or raw in ("-", "없음"):
        return None
    try:
        s = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_SEOUL)
        return dt.astimezone(_SEOUL).replace(microsecond=0)
    except ValueError:
        pass
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        try:
            d = date.fromisoformat(raw)
            return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=_SEOUL)
        except ValueError:
            return None
    # "YYYY-MM-DD HH:MM:SS"
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.replace(tzinfo=_SEOUL)
        except ValueError:
            continue
    return None


def _date_iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _ts_iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _text_or_none(v: object) -> str | None:
    s = _s(v)
    return s if s else None


# ---------------------------------------------------------------------------
# Supabase REST (httpx — 추가 패키지 없음)
# ---------------------------------------------------------------------------


class SupabaseMigrator:
    def __init__(self, url: str, service_role_key: str) -> None:
        base = url.rstrip("/")
        self._rest = f"{base}/rest/v1"
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

    def count(self, table: str) -> int:
        headers = {**self._headers, "Prefer": "count=exact"}
        with httpx.Client(timeout=60.0) as client:
            r = client.head(
                f"{self._rest}/{table}",
                params={"select": "legacy_id"},
                headers=headers,
            )
            r.raise_for_status()
            cr = r.headers.get("content-range", "")
            # e.g. */120 or 0-9/120
            if "/" in cr:
                part = cr.split("/")[-1]
                if part.isdigit():
                    return int(part)
        return 0

    def upsert(self, table: str, rows: list[dict[str, Any]]) -> int:
        if not rows:
            return 0
        headers = {
            **self._headers,
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }
        written = 0
        with httpx.Client(timeout=120.0) as client:
            for i in range(0, len(rows), _UPSERT_BATCH):
                chunk = rows[i : i + _UPSERT_BATCH]
                r = client.post(
                    f"{self._rest}/{table}",
                    params={"on_conflict": "legacy_id"},
                    headers=headers,
                    json=chunk,
                )
                if r.status_code >= 400:
                    raise RuntimeError(
                        f"Supabase upsert {table} failed HTTP {r.status_code}: {r.text[:500]}"
                    )
                written += len(chunk)
        return written


# ---------------------------------------------------------------------------
# Sheet → DB record transforms
# ---------------------------------------------------------------------------


def transform_task(row: dict[str, Any]) -> dict[str, Any]:
    due_d, due_raw_keep = parse_date(row.get("마감일"))
    return {
        "legacy_id": row["id"],
        "sheet_row": row.get("sheet_row"),
        "date_group": _text_or_none(row.get("날짜그룹")),
        "priority": _text_or_none(row.get("우선순위")),
        "completed": parse_bool(row.get("완료")),
        "due_date": _date_iso(due_d),
        "due_date_raw": due_raw_keep,
        "domain": _text_or_none(row.get("분야")),
        "category": _text_or_none(row.get("분류")),
        "major_category": _text_or_none(row.get("대분류")),
        "quantification_minutes": _text_or_none(row.get("정량화 분")),
        "title": _s(row.get("업무명")),
        "quantification": _text_or_none(row.get("정량화")),
        "quantification_type": _text_or_none(row.get("정량화 구분")),
        "time_raw": _text_or_none(row.get("시간")),
        "time_converted": _text_or_none(row.get("시간변환")),
        "platform": _text_or_none(row.get("관련플랫폼")),
        "detail_value": _text_or_none(row.get("세부수치")),
        "detail_unit": _text_or_none(row.get("세부단위")),
        "related_work": _text_or_none(row.get("관련작품")),
        "difficulty": _text_or_none(row.get("난이도")),
        "fatigue": _text_or_none(row.get("담당자") or row.get("피로도")),
        "work_assignee": _text_or_none(
            row.get("외부담당자") or row.get("업무담당") or row.get("인물담당") or row.get("상태")
        ),
        "task_manager": _text_or_none(row.get("담당자")),
        "memo": _text_or_none(row.get("메모")),
    }


def transform_upload_row(row: dict[str, Any]) -> dict[str, Any]:
    def date_fields(sheet_key: str, col: str, raw_col: str) -> dict[str, Any]:
        d, raw_keep = parse_date(row.get(sheet_key))
        out: dict[str, Any] = {col: _date_iso(d), raw_col: raw_keep}
        return out

    rec: dict[str, Any] = {
        "legacy_id": row["id"],
        "sheet_row": row.get("sheet_row"),
        "completed": parse_bool(row.get("완료")),
        "platform_name": _text_or_none(row.get("플랫폼명")),
        "major_category": _text_or_none(row.get("대분류")),
        "work_title": _s(row.get("작품명")),
        "uploaded_episodes": parse_int(row.get("업로드화수")),
        "remaining_episodes": parse_int(row.get("남은업로드화수")),
        "upload_status": _text_or_none(row.get("업로드완료여부")),
        "upload_cycle": _text_or_none(row.get("업로드주기")),
        "upload_weekday": _text_or_none(row.get("업로드요일")),
        "upload_method": _text_or_none(row.get("업로드방식")),
        "manuscript_ready": _text_or_none(row.get("원고준비")),
        "upload_link": _text_or_none(row.get("업로드링크")),
        "last_upload_episode": _text_or_none(row.get("마지막업로드회수")),
        "note": _text_or_none(row.get("비고")),
    }
    rec.update(date_fields("업로드일", "upload_date", "upload_date_raw"))
    rec.update(date_fields("런칭일", "launch_date", "launch_date_raw"))
    rec.update(date_fields("마지막업로드일", "last_upload_date", "last_upload_date_raw"))
    rec.update(date_fields("다음업로드일", "next_upload_date", "next_upload_date_raw"))
    return rec


def _platform_cell(rec: dict[str, Any], *keys: str) -> str:
    for k in keys:
        if k in rec:
            return _s(rec[k])
    return ""


def transform_platform_row(rec: dict[str, Any]) -> dict[str, Any]:
    last_raw = _platform_cell(rec, "마지막업데이트날짜")
    last_ts = parse_timestamptz(last_raw)

    db: dict[str, Any] = {
        "legacy_id": rec["id"],
        "sheet_row": rec.get("sheet_row"),
        "company_name": _platform_cell(rec, "회사명"),
        "category": _text_or_none(_platform_cell(rec, "분류")),
        "major_category": _text_or_none(_platform_cell(rec, "대분류")),
        "announcement_date": _text_or_none(_platform_cell(rec, "발표일")),
        "subsidy_program": parse_bool(_platform_cell(rec, "지원사업")),
        "contract_general": _text_or_none(_platform_cell(rec, "일반계약")),
        "blocked": parse_bool(_platform_cell(rec, "불가")),
        "scheduled": parse_bool(_platform_cell(rec, "예정")),
        "in_progress": parse_bool(_platform_cell(rec, "진행중")),
        "done": parse_bool(_platform_cell(rec, "완료")),
        "contract_status": _text_or_none(_platform_cell(rec, "계약")),
        "meeting": _text_or_none(_platform_cell(rec, "미팅")),
        "current_stage": _text_or_none(_platform_cell(rec, "현재단계")),
        "last_updated_at": _ts_iso(last_ts),
        "last_updated_at_raw": last_raw if last_raw and last_ts is None else None,
        "last_situation": _text_or_none(
            _platform_cell(rec, "마지막 상황", "마지막상황")
        ),
        "waiting_reason": _text_or_none(_platform_cell(rec, "대기사유")),
        "next_action": _text_or_none(_platform_cell(rec, "다음액션")),
        "platform_name": _text_or_none(_platform_cell(rec, "플랫폼명")),
        "priority": _text_or_none(_platform_cell(rec, "우선순위")),
        "note": _text_or_none(_platform_cell(rec, "비고", "메모")),
        "extra": {},
    }

    extra: dict[str, str] = {}
    for key, val in rec.items():
        if key in ("id", "sheet_row"):
            continue
        if key in _PLATFORM_CORE_SHEET_HEADERS:
            continue
        if key.startswith("_col_"):
            continue
        s = _s(val)
        if s:
            extra[key] = s
    db["extra"] = extra
    return db


def transform_memo(item: Any) -> dict[str, Any]:
    sheet_row = item.sheet_row
    raw = _s(item.memo_date)
    ts = parse_timestamptz(raw)
    return {
        "legacy_id": f"memo-row-{sheet_row}",
        "sheet_row": sheet_row,
        "content": _s(item.content),
        "memo_at": _ts_iso(ts) or datetime.now(_SEOUL).isoformat(),
        "memo_at_raw": raw if raw and ts is None else None,
        "category": item.category,
    }


def normalize_work_row_for_upsert(row: dict[str, Any]) -> dict[str, Any]:
    """public.works UPSERT 본문: 모든 행이 동일한 키 집합을 갖도록 채운다. extra는 항상 dict."""
    raw_extra = row.get("extra")
    extra: dict[str, Any] = dict(raw_extra) if isinstance(raw_extra, dict) else {}
    out: dict[str, Any] = {}
    for col in _WORKS_UPSERT_COLUMNS:
        if col == "extra":
            out[col] = extra
        elif col == "production_done":
            v = row.get(col)
            out[col] = bool(v) if v is not None else False
        else:
            out[col] = row.get(col)
    return out


def _assert_works_rows_uniform_keys(prepared: list[dict[str, Any]], *, table_label: str) -> None:
    if not prepared:
        safe_print(f"  [{table_label}] key check: 0 rows — uniform keys N/A")
        return
    expected = _WORKS_UPSERT_KEY_SET
    for i, row in enumerate(prepared):
        keys = frozenset(row.keys())
        if keys != expected:
            raise AssertionError(
                f"{table_label}: row {i} key mismatch — "
                f"missing={sorted(expected - keys)!r} extra={sorted(keys - expected)!r}"
            )
        ex = row.get("extra")
        if not isinstance(ex, dict):
            raise AssertionError(f"{table_label}: row {i} extra is not a dict: {type(ex)!r}")
    safe_print(
        f"  [{table_label}] key check: {len(prepared)} rows, "
        f"all match {len(_WORKS_UPSERT_KEY_SET)} columns — uniform keys OK"
    )


def _works_title_candidate(rec: dict[str, Any]) -> str:
    return _s(rec.get("작품명"))


def _is_works_header_row(rec: dict[str, Any]) -> bool:
    t = _works_title_candidate(rec)
    if not t:
        return False
    if t in _WORKS_TITLE_HEADER_MARKERS:
        return True
    if t.casefold() in {m.casefold() for m in _WORKS_TITLE_HEADER_MARKERS}:
        return True
    return False


def transform_work_core(sheet_row: int, rec: dict[str, Any]) -> dict[str, Any]:
    """작품명이 비어 있지 않다고 가정. DB 컬럼명 기준 dict (정규화 전)."""
    title = _s(rec.get("작품명"))
    db: dict[str, Any] = {
        "legacy_id": f"work-row-{sheet_row}",
        "sheet_row": sheet_row,
        "extra": {},
    }
    extra: dict[str, Any] = {}

    for header, val in rec.items():
        if val is None:
            continue
        if isinstance(val, str) and not val.strip():
            continue
        col = _WORKS_HEADER_TO_COLUMN.get(header)
        if col == "production_done":
            db[col] = parse_bool(val)
        elif col == "active_site_count":
            db[col] = parse_int(val)
        elif col in _WORKS_DB_COLUMNS:
            db[col] = _cell_to_json(val) if not isinstance(val, str) else val.strip()
        else:
            extra[header] = _cell_to_json(val)

    db["title"] = title
    db["extra"] = extra
    return db


def prepare_work_row(
    sheet_row: int,
    rec: dict[str, Any],
    seen_titles: set[str],
) -> tuple[dict[str, Any] | None, str | None]:
    """
    (normalized_row, None) 또는 (None, skip_reason).
    skip_reason: empty_title | header_row | duplicate_title | invalid_row
    """
    if _is_works_header_row(rec):
        return None, "header_row"
    title_cand = _works_title_candidate(rec)
    if not title_cand:
        return None, "empty_title"
    if title_cand in seen_titles:
        return None, "duplicate_title"
    try:
        core = transform_work_core(sheet_row, rec)
        nt = normalize_work_row_for_upsert(core)
        seen_titles.add(title_cand)
        return nt, None
    except Exception:
        return None, "invalid_row"


def transform_work(sheet_row: int, rec: dict[str, Any]) -> dict[str, Any] | None:
    """호환용: 단일 행 변환만 필요할 때 (seen/duplicate 미적용)."""
    if _is_works_header_row(rec):
        return None
    title = _works_title_candidate(rec)
    if not title:
        return None
    try:
        core = transform_work_core(sheet_row, rec)
        return normalize_work_row_for_upsert(core)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Load from Sheets (read-only)
# ---------------------------------------------------------------------------


def load_tasks(settings: Settings) -> list[dict[str, Any]]:
    """업무정리 탭만. 체크리스트와 탭이 같으면 여기서만 이관(중복 방지)."""
    return fetch_tasks(settings)


def load_upload_rows(settings: Settings) -> list[dict[str, Any]]:
    return fetch_upload_rows(settings)


def load_platform_rows(settings: Settings) -> list[dict[str, Any]]:
    return fetch_platforms(settings)


def load_memos(settings: Settings) -> list[Any]:
    return fetch_memos_from_google_sheets(settings)


def load_works_with_rows(settings: Settings) -> list[tuple[int, dict[str, Any]]]:
    """작품정리: sheet_row 보존을 위해 master 읽기 로직 + 행 번호."""
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_FILE / GOOGLE_SHEET_URL required")

    cred_path = Path(settings.google_service_account_file).expanduser()
    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)
    tab = settings.google_works_tab.replace("'", "''")
    range_a1 = f"'{tab}'!A:ZZ"
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    if not rows:
        return []

    keys = _header_keys(rows[0])
    out: list[tuple[int, dict[str, Any]]] = []
    for sheet_row, row in enumerate(rows[1:], start=2):
        if _row_all_blank(row):
            continue
        padded = list(row)
        rec: dict[str, Any] = {}
        for i, key in enumerate(keys):
            val = padded[i] if i < len(padded) else None
            rec[key] = _cell_to_json(val)
        out.append((sheet_row, rec))
    return out


def checklist_same_as_tasks(settings: Settings) -> bool:
    return settings.google_checklist_tab.strip() == settings.google_tasks_tab.strip()


# ---------------------------------------------------------------------------
# Per-table migration
# ---------------------------------------------------------------------------


def migrate_table(
    table: str,
    settings: Settings,
    sb: SupabaseMigrator | None,
    *,
    execute: bool,
    limit: int | None,
) -> tuple[int, int, int, int]:
    """
    Returns (found, prepared, count_before, count_after).
    """
    if table == "tasks":
        raw = load_tasks(settings)
        if checklist_same_as_tasks(settings):
            safe_print(
                f"  (checklist tab '{settings.google_checklist_tab}' "
                f"== tasks tab '{settings.google_tasks_tab}': single import)"
            )
        prepared = [transform_task(r) for r in raw]
    elif table == "upload_rows":
        raw = load_upload_rows(settings)
        prepared = [transform_upload_row(r) for r in raw]
    elif table == "platform_rows":
        raw = load_platform_rows(settings)
        prepared = [transform_platform_row(r) for r in raw]
    elif table == "memos":
        raw = load_memos(settings)
        prepared = [transform_memo(m) for m in raw]
    elif table == "works":
        raw_pairs = load_works_with_rows(settings)
        skip_counts: Counter[str] = Counter()
        seen_titles: set[str] = set()
        prepared: list[dict[str, Any]] = []
        trace_cap = limit if (not execute and limit is not None) else None
        if trace_cap is not None:
            safe_print(f"  works dry-run trace (first {trace_cap} sheet data rows):")
        for idx_pair, (sheet_row, rec) in enumerate(raw_pairs):
            title_disp = _works_title_candidate(rec)
            row_out, skip_reason = prepare_work_row(sheet_row, rec, seen_titles)
            if trace_cap is not None and idx_pair < trace_cap:
                if skip_reason:
                    safe_print(
                        f"    sheet_row={sheet_row} "
                        f"title_candidate={title_disp!r} skip={skip_reason}"
                    )
                else:
                    safe_print(
                        f"    sheet_row={sheet_row} "
                        f"title_candidate={title_disp!r} skip=prepared"
                    )
            if skip_reason:
                skip_counts[skip_reason] += 1
            else:
                assert row_out is not None
                prepared.append(row_out)
        raw = raw_pairs
        safe_print(
            "  works skip summary: "
            f"empty_title={skip_counts.get('empty_title', 0)}, "
            f"header_row={skip_counts.get('header_row', 0)}, "
            f"duplicate_title={skip_counts.get('duplicate_title', 0)}, "
            f"invalid_row={skip_counts.get('invalid_row', 0)} "
            f"(total skipped: {sum(skip_counts.values())})"
        )
        _assert_works_rows_uniform_keys(prepared, table_label="works")
    else:
        raise ValueError(f"unknown table: {table}")

    found = len(raw)
    if limit is not None:
        prepared = prepared[:limit]

    count_before = sb.count(table) if sb else -1
    if execute and sb:
        sb.upsert(table, prepared)
    count_after = sb.count(table) if (execute and sb) else count_before

    return found, len(prepared), count_before, count_after


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _env_supabase(*, required: bool) -> tuple[str, str] | tuple[None, None]:
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if url and key:
        return url, key
    if required:
        raise SystemExit(
            "[설정] SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 환경 변수에 설정하세요.\n"
            "예: backend/.env 에 추가 후 실행"
        )
    return None, None


def main() -> int:
    _configure_runtime_io()

    parser = argparse.ArgumentParser(
        description="Migrate Google Sheets data to Supabase (read-only from Sheets)."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually upsert to Supabase (default: dry-run)",
    )
    parser.add_argument(
        "--table",
        action="append",
        choices=_TABLES,
        dest="tables",
        help="Migrate only this table (repeatable). Default: all",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Only prepare/upsert first N rows per table",
    )
    args = parser.parse_args()

    tables = args.tables or list(_TABLES)
    execute = args.execute

    try:
        settings = load_settings()
    except Exception:
        safe_print("[오류] Google 설정 로드 실패 — traceback:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1

    sb: SupabaseMigrator | None = None
    url, key = _env_supabase(required=execute)
    if url and key:
        sb = SupabaseMigrator(url, key)
    elif execute:
        return 1
    if not execute:
        safe_print("dry-run mode: no data inserted\n")

    total_prepared = 0
    for table in tables:
        try:
            found, prepared, before, after = migrate_table(
                table,
                settings,
                sb,
                execute=execute,
                limit=args.limit,
            )
            total_prepared += prepared
            safe_print(f"{table}: {found} rows found, {prepared} rows prepared")
            if sb is not None and before >= 0:
                if execute:
                    safe_print(f"  supabase count: {before} → {after}")
                else:
                    safe_print(f"  supabase count (unchanged): {before}")
            elif sb is None and not execute:
                safe_print("  supabase count: (set SUPABASE_* env to show)")
        except Exception:
            safe_print(f"{table}: FAILED — traceback:", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return 1

    if not execute:
        safe_print("\ndry-run mode: no data inserted")
    else:
        safe_print(f"\nexecute complete: {total_prepared} rows upserted (batched)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
