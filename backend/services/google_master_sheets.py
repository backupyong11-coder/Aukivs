# -*- coding: utf-8 -*-
"""Google Sheets: 플랫폼/작품 마스터 탭을 헤더(1행) 기준 dict 행으로 읽습니다."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from config import Settings

from .google_sheets import read_sheet_tab_values, spreadsheet_id_from_url
from .sheets_errors import SheetsConfigurationError


def _escape_tab(tab_name: str) -> str:
    return tab_name.replace("'", "''")


def _header_keys(header_row: list[object]) -> list[str]:
    raw: list[str] = []
    for i, c in enumerate(header_row):
        s = str(c).strip() if c is not None else ""
        raw.append(s if s else f"_col_{i + 1}")
    keys: list[str] = []
    counts: dict[str, int] = {}
    for h in raw:
        n = counts.get(h, 0)
        counts[h] = n + 1
        keys.append(h if n == 0 else f"{h}_{n + 1}")
    return keys


def _cell_to_json(cell: object) -> Any:
    if cell is None:
        return None
    if isinstance(cell, str) and cell.strip() == "":
        return None
    return cell


def _row_all_blank(row: list[object]) -> bool:
    for c in row:
        if c is None:
            continue
        if isinstance(c, str):
            if c.strip():
                return False
        else:
            return False
    return True


def fetch_master_tab_keyed_rows(settings: Settings, tab_name: str) -> list[dict[str, Any]]:
    """
    탭의 1행을 헤더로 두고, 2행부터 각 행을 {헤더: 값} dict로 반환합니다.
    빈 헤더 칸은 ``_col_1`` 형식 키를 씁니다. 동일 헤더가 반복되면 ``이름_2``처럼 접미사를 붙입니다.
    값이 비어 있으면 JSON null(None)입니다.
    """
    if not settings.google_service_account_file or not settings.google_sheet_url:
        raise SheetsConfigurationError(
            "[설정] GOOGLE_SERVICE_ACCOUNT_FILE 과 GOOGLE_SHEET_URL 을 "
            "backend/.env 등에 설정하세요."
        )
    cred_path = Path(settings.google_service_account_file).expanduser()
    if not cred_path.is_file():
        raise SheetsConfigurationError(
            f"[설정] 서비스 계정 JSON 파일을 찾을 수 없습니다: {cred_path.resolve()}"
        )

    spreadsheet_id = spreadsheet_id_from_url(settings.google_sheet_url)
    esc = _escape_tab(tab_name)
    range_a1 = f"'{esc}'!A:ZZ"
    rows = read_sheet_tab_values(cred_path, spreadsheet_id, range_a1)
    if not rows:
        return []

    keys = _header_keys(rows[0])
    out: list[dict[str, Any]] = []
    for row in rows[1:]:
        if _row_all_blank(row):
            continue
        padded = list(row)
        rec: dict[str, Any] = {}
        for i, key in enumerate(keys):
            val = padded[i] if i < len(padded) else None
            rec[key] = _cell_to_json(val)
        out.append(rec)
    return out
