"""Supabase SQL 마이그레이션 파일 실행 (DDL).

환경 변수 (둘 중 하나):
  DATABASE_URL=postgresql://postgres.[ref]:[password]@...supabase.com:6543/postgres
  SUPABASE_DB_PASSWORD=[프로젝트 DB 비밀번호]  (+ backend/.env 의 SUPABASE_URL)

사용:
  pip install psycopg2-binary python-dotenv
  python scripts/apply_supabase_migration.py 006_task_work_assignee
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"


def _database_url() -> str:
    env = dotenv_values(ROOT / "backend" / ".env")
    direct = (env.get("DATABASE_URL") or "").strip()
    if direct:
        return direct
    password = (env.get("SUPABASE_DB_PASSWORD") or "").strip()
    base = (env.get("SUPABASE_URL") or "").strip().rstrip("/")
    if not password or not base:
        raise SystemExit(
            "[설정] DATABASE_URL 또는 SUPABASE_DB_PASSWORD + SUPABASE_URL 이 필요합니다.\n"
            "Supabase Dashboard → Project Settings → Database → Connection string (Session pooler)"
        )
    m = re.search(r"https://([^.]+)\.supabase\.co", base)
    if not m:
        raise SystemExit(f"[설정] SUPABASE_URL 형식 오류: {base}")
    ref = m.group(1)
    return (
        f"postgresql://postgres.{ref}:{password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
    )


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: apply_supabase_migration.py <migration_stem>")
    stem = sys.argv[1].removesuffix(".sql")
    sql_path = MIGRATIONS / f"{stem}.sql"
    if not sql_path.is_file():
        raise SystemExit(f"파일 없음: {sql_path}")
    sql = sql_path.read_text(encoding="utf-8")

    try:
        import psycopg2
    except ImportError as exc:
        raise SystemExit("pip install psycopg2-binary") from exc

    url = _database_url()
    print(f"Applying {sql_path.name} …")
    with psycopg2.connect(url) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
    print("Done.")


if __name__ == "__main__":
    main()
