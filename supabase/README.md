# Supabase schema (WorkSheet Ops)

Google Sheets 기반 데이터를 Supabase(Postgres)로 옮기기 위한 **1차 DDL**입니다.  
이 단계에서는 **기존 `google_*.py` / `main.py` / 프론트엔드를 변경하지 않습니다.**

## 적용 방법

1. Supabase Dashboard → **SQL Editor**에서 `migrations/001_initial_schema.sql` 실행  
   또는 Supabase CLI: `supabase db push` (프로젝트에 CLI 연결된 경우)
2. 백엔드는 이후 단계에서 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`로 접속합니다.
3. RLS가 켜져 있고 정책이 없으므로 **브라우저/anon 키로는 읽기·쓰기 불가** — 서비스 롤만 사용하세요.

## 테이블 목록

| 우선순위 | 테이블 | 대응 시트 (기본 env) |
|----------|--------|----------------------|
| P0 | `tasks` | `업무정리` (`GOOGLE_TASKS_TAB`) |
| P0 | `upload_rows` | `업로드정리` (`GOOGLE_UPLOAD_ROWS_TAB`) |
| P0 | `platform_rows` | `플랫폼정리` / `GOOGLE_PLATFORM_TAB` |
| P1 | `memos` | `메모장` (`GOOGLE_MEMO_TAB`) |
| P1 | `works` | `작품정리` (`GOOGLE_WORKS_TAB`) |
| — | `weekly_agenda_documents` | 주간 아젠다 JSON (`003_weekly_agenda_documents.sql`) |
| — | `table_list_preferences` | 정리 표 열 너비 등 UI (`005_table_list_preferences.sql`) |
| — | `tasks.work_assignee` | 업무담당 (`006_task_work_assignee.sql`, 구 `status`+`assignee` 통합) |

**006 적용:** Dashboard SQL Editor에서 `migrations/006_task_work_assignee.sql` 실행, 또는
`backend/.env`에 `SUPABASE_DB_PASSWORD` 설정 후
`python backend/scripts/apply_supabase_migration.py 006_task_work_assignee`

**이번 DDL에 포함하지 않음 (P2):** `업로드운영` (`GOOGLE_UPLOADS_TAB`) → 레거시 `/uploads` API용.

## 공통 컬럼

모든 테이블:

| 컬럼 | 설명 |
|------|------|
| `id` | `uuid` PK, `gen_random_uuid()` |
| `legacy_id` | 시트 행 기반 API id 보존 (`task-row-5` 등), UNIQUE nullable |
| `sheet_row` | 스프레드시트 1-based 행 번호 (감사·디버그) |
| `created_at` / `updated_at` | `timestamptz`; UPDATE 시 `set_updated_at()` 트리거 |

## Google 시트 탭 ↔ Supabase 매핑

| 시트 탭 (환경 변수) | Supabase | `legacy_id` 규칙 | 비고 |
|---------------------|----------|------------------|------|
| `업무정리` | `tasks` | `task-row-{sheet_row}` | `/tasks` API |
| `GOOGLE_CHECKLIST_TAB` (=업무정리인 경우) | `tasks` (동일) | 마이그레이션 시 `task-row-*` 권장; API의 `sheet-row-*`는 lookup 별칭 검토 | `/checklist` |
| `업로드정리` | `upload_rows` | `upload-row-{sheet_row}` | `/upload-rows` |
| `플랫폼정리` 등 | `platform_rows` | `platform-row-{sheet_row}` | `/platform-rows`, 현재진행·발표일 |
| `메모장` | `memos` | `memo-row-{sheet_row}` | `/memos` |
| `작품정리` | `works` | `work-row-{sheet_row}` | `/works-master` |
| `업로드운영` | — | — | P2 `uploads_legacy` 예정 |

## 테이블별 설계 이유

### `tasks`

- 업무정리 탭은 **21개 논리 필드**가 API에 고정되어 있어 컬럼화가 적합합니다.
- `due_date`는 `date`로 쿼리·브리핑에 사용하고, 파싱 실패 시 `due_date_raw`에 원문을 둡니다.
- `completed`는 시트의 `완료` 체크(TRUE/1/YES)를 boolean으로 정규화합니다.
- 체크리스트와 탭이 같으면 **한 테이블**로 통합하고, 완료/미완료는 `completed`로 구분합니다.

### `upload_rows`

- `google_upload_rows_sheets` 필드와 1:1 대응.
- 화수(`uploaded_episodes`, `remaining_episodes`)는 `int`로 집계(`/stats`)에 유리.
- 날짜 열은 `date` + `*_raw` 이중 보관(시트에 빈 칸·비표준 문자열 대비).

### `platform_rows`

- 시트는 **A~AO(41열)** 등 넓고 헤더가 늘 수 있음.
- UI·`/stats`·현재진행/발표일에서 쓰는 **핵심 열만 컬럼**으로 두고, 나머지는 `extra jsonb`에 `{ "헤더명": "값" }` 형태로 저장합니다.
- `announcement_date`는 `없음`, `-` 등이 있어 **text** 유지.
- `last_updated_at`은 파싱 가능할 때만 `timestamptz`, 아니면 `last_updated_at_raw`.

### `memos`

- 열 3개(내용·날짜·분류)로 단순; append 위주.
- `memo_at`은 서울 기준 시각을 `timestamptz`로 저장.

### `works`

- 작품정리 마스터는 문서화된 A~X + 추가 헤더 → **핵심 컬럼 + `extra`**.
- `title` UNIQUE로 작품명 기준 조인·중복 방지.

## 날짜·불리언 처리 (마이그레이션 시)

| 시트 표현 | DB 저장 |
|-----------|---------|
| `YYYY-MM-DD` | `date` 컬럼 + 필요 시 raw 비움 |
| ISO datetime | `timestamptz` (`memos.memo_at`, `platform_rows.last_updated_at`) |
| 파싱 실패 / `-` / `없음` | `*_raw` text만 또는 text 컬럼(`announcement_date`) |
| `TRUE`, `1`, `YES`, `Y` | `boolean` true |

## RLS

- 모든 테이블: `ENABLE ROW LEVEL SECURITY`, **정책 없음**.
- FastAPI는 **service role**로만 접근 → 기존 Sheets와 동일하게 “백엔드만 DB 접근”.
- 추후 인증 사용자별 정책이 필요하면 별도 migration에서 추가.

---

## 데이터 이관 스크립트

**파일:** `backend/scripts/migrate_sheets_to_supabase.py`

Sheets **읽기만** 하고 Supabase에 `legacy_id` 기준 UPSERT 합니다.  
`main.py` / 프론트 / `google_*.py` 동작은 바꾸지 않습니다.

### 환경 변수

`backend/.env` (또는 셸)에 기존 Google 변수 + Supabase 추가:

```env
# 기존 (Sheets 읽기)
GOOGLE_SERVICE_ACCOUNT_FILE=...
GOOGLE_SHEET_URL=...

# 이관용
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 실행 (backend 디렉터리에서)

```bash
cd backend

# 기본: dry-run (Supabase에 쓰지 않음)
python scripts/migrate_sheets_to_supabase.py

# 일부만 테스트
python scripts/migrate_sheets_to_supabase.py --table tasks --limit 5

# 실제 이관
python scripts/migrate_sheets_to_supabase.py --execute

# 테이블별
python scripts/migrate_sheets_to_supabase.py --execute --table upload_rows
python scripts/migrate_sheets_to_supabase.py --execute --table platform_rows
```

### 재사용하는 Sheets 함수

| 테이블 | 함수 |
|--------|------|
| `tasks` | `fetch_tasks` (체크리스트 탭 = 업무정리 탭이면 여기만, 중복 없음) |
| `upload_rows` | `fetch_upload_rows` |
| `platform_rows` | `fetch_platforms` |
| `memos` | `fetch_memos_from_google_sheets` |
| `works` | `read_sheet_tab_values` + master 헤더 유틸 (`sheet_row` 보존) |

---

## `migrate_sheets_to_supabase.py` 상세 (참고)

### 목표

- 기존 `google_*_sheets` **읽기 함수만** 호출해 Postgres에 UPSERT.
- `main.py` / 프론트 / Sheets 쓰기 경로는 **그대로** (이관 스크립트만 실행).

### 순서

1. `tasks` ← `fetch_tasks(settings)`  
2. `upload_rows` ← `fetch_upload_rows(settings)`  
3. `platform_rows` ← `fetch_platforms(settings)` → core 필드 매핑 + 나머지 → `extra`  
4. `memos` ← `fetch_memos_from_google_sheets(settings)`  
5. `works` ← `fetch_master_tab_keyed_rows(settings, google_works_tab)`

### 행 매핑 규칙

- `legacy_id`: 위 표 규칙 (`task-row-{sheet_row}` 등).
- `sheet_row`: API의 `sheet_row` 또는 행 번호 파싱.
- `ON CONFLICT (legacy_id) DO UPDATE` 로 **재실행 가능(멱등)**.

### 체크리스트 / 업무정리 중복

- `GOOGLE_CHECKLIST_TAB == GOOGLE_TASKS_TAB`이면 **tasks 1회만** 이관.
- 레거시 체크리스트 전용 탭(`A2:K`)이면: 동일 `tasks`에 넣되 `legacy_id`를 `sheet-row-N`으로도 INSERT하거나, 마이그레이션 문서에 따라 `task-row-N`으로 통일.

### CLI 플래그 (예정)

- `--dry-run` — 변환만, DB 미쓰기  
- `--table tasks|upload_rows|...` — 부분 이관  
- `--limit N` — 샘플 검증  

### 환경 변수 (예정)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- 기존 `GOOGLE_*` (Sheets 읽기용)

### 검증

- 탭별 row count vs Supabase `count(*)`  
- `legacy_id` 샘플 10건 spot-check  
- `due_date` / `extra` 파싱 실패 로그 파일

---

## 이후 단계 (참고)

1. Repository 레이어 (`backend/repositories/`) + `DATA_BACKEND=supabase|sheets` 플래그  
2. `main.py`에서 점진적 전환 (P0 읽기 → P0 쓰기)  
3. 레거시 `업로드운영` 테이블 여부 결정 (P2)
