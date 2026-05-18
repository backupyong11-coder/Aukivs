# 개인용 운영 비서

Next.js(App Router) 프론트와 FastAPI 백엔드가 분리된 구조입니다. 민감한 키는 프론트에 두지 않습니다.

## 인수인계·현황 문서 (최신)

| 문서 | 용도 |
|------|------|
| [**인수인계서.md**](./인수인계서.md) | **일상 운영 필독**: Supabase/Fly/Vercel 역할, 로컬 2터미널, 배포·메모 삭제·자주 하는 실수 |
| [**README_DEPLOY_FINAL.md**](./README_DEPLOY_FINAL.md) | **배포 직전 마감**: 로컬 체크리스트, Railway/Vercel 클릭 순서, env 복붙, 공유 문구 |
| [**README_DEPLOY.md**](./README_DEPLOY.md) | **클라우드 상시 배포**: Vercel(프론트) + Railway/Render(백엔드), 환경 변수, Google JSON, 초보 순서 |
| [**QUICK_START_VALIDATION.md**](./QUICK_START_VALIDATION.md) | **5분 검증**: 자동 스크립트, 수동 명령, Windows 한글·`[]` 경로 대응, UI 스모크 체크리스트 |
| [MANUAL_LIVE_VERIFICATION_LOG.md](./MANUAL_LIVE_VERIFICATION_LOG.md) | **실제 Sheets/OpenAI** 연결 후 브라우저 수동 검증 결과 기록용 표 |
| [current_app_status_report.md](./current_app_status_report.md) | 기능 완료/검증/보류 표, 에러 원칙, 운영 플로우 |
| [FULL_HANDOFF_AND_NEXT_STEPS.md](./FULL_HANDOFF_AND_NEXT_STEPS.md) | API·라우트 요약, 다음 작업 순서, 다음 채팅용 붙여넣기 문단 |

## 데이터 백엔드 전환 상태 (최종)

`backend/.env`의 **`DATA_BACKEND=sheets`**(기본) 또는 **`supabase`**로 주요 업무 데이터 소스를 고릅니다. **`google_*.py`는 유지**되며, `sheets`로 바꾸면 언제든 기존 동작으로 롤백할 수 있습니다.

> **보안 경고 — `SUPABASE_SERVICE_ROLE_KEY`**  
> 이 키는 **Postgres 전 권한**입니다. **`backend/.env`에만** 두세요.  
> **넣지 마세요:** 프론트 소스·`frontend/.env*`·Vercel/브라우저 노출 env·Git 커밋·스크린샷·채팅 로그.  
> 프론트는 **`/api/ops` → 백엔드**로만 호출하고, Supabase anon/service 키를 쓰지 않습니다.

### API별 데이터 소스 (`DATA_BACKEND=supabase` 기준)

| 영역 | API (예) | Supabase | Google Sheets |
|------|----------|:--------:|:-------------:|
| 체크리스트 | `GET/POST /checklist`, `…/create`, `…/complete`, `…/update`, `…/delete` | 주 | — |
| 업무정리 | `GET/POST /tasks`, `…/create`, `…/update`, `…/delete` | 주 | — |
| 업로드정리 | `GET/POST /upload-rows`, `…/*` | 주 | — |
| 플랫폼정리 | `GET/POST /platform-rows`, `…/*` | 주 | — |
| 메모장 | `GET /memos`, `POST /memos/append` | 주 | — |
| 작품 마스터 | `GET /works-master` | 주 | — |
| 관제·집계 | `GET /briefing/today`, `GET /stats` | 해당 파트는 Supabase 행 사용 | — |
| 플랫폼 마스터 | `GET /platform-master` | — | 주 |
| 레거시 업로드 운영 | `GET/POST /uploads`, `…/create`, `…/delete`, `…/update`, `…/next-episode` | — | 주 |
| AI — 업로드 제안 | `POST /ai/uploads/suggest` | — | 주 (시트 기반) |
| AI — 체크리스트 제안 | `POST /ai/checklist/suggest` | 체크리스트 **컨텍스트**는 Supabase | `sheets` 모드에서는 시트 |
| 기타 | `GET /health` | — | — |

`DATA_BACKEND=sheets`이면 위 표에서 「Supabase」였던 API는 **전부 Google Sheets**를 씁니다. **`supabase` 모드에서도** 레거시 `/uploads*`, `/platform-master`, `POST /ai/uploads/suggest`는 **시트 URL·서비스 계정**이 필요합니다.

### 초보자용: 로컬에서 한 번에 띄우기

1. **준비:** [Python](https://www.python.org/) 3.11+ , [Node.js](https://nodejs.org/) 20+ 설치.
2. **저장소 클론** 후 터미널을 프로젝트 루트로 연다.
3. **백엔드 환경 변수:** `backend` 폴더에 `backend/.env` 파일을 만든다.  
   - `backend/.env.example`을 복사한 뒤 값 채우기.  
   - Supabase 쓰는 경우: `DATA_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (**이 파일에만**).
4. **백엔드 실행:**
   ```bash
   cd backend
   python -m pip install -r requirements-dev.txt
   python -m pytest -q
   python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
   ```
5. **브라우저로 확인:** `http://127.0.0.1:8001/health` → `{"status":"ok"}`.
6. **프론트 환경 변수:** `frontend/.env.local` 생성:
   ```
   OPSPROXY_TARGET=http://127.0.0.1:8001
   ```
   (`NEXT_PUBLIC_API_BASE_URL`는 비워 두는 것을 권장 — 동일 출처 `/api/ops` 경유.)
7. **프론트 실행:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
8. **앱:** `http://localhost:3000` — 홈 브리핑·관제판, 하단 네비.

시트 업무용 **상세 헤더·탭 이름**은 아래 「Google Sheets」 절과 `backend/.env.example` 주석을 본다.

### 운영(배포) 전 체크리스트

- [ ] `backend/.env`(또는 호스팅 비밀 변수): `DATA_BACKEND` 의도한 값.
- [ ] Supabase 사용 시: 프로젝트에 마이그레이션 반영, RLS·키 회전 정책 확인.
- [ ] **`SUPABASE_SERVICE_ROLE_KEY`가 레포·프론트·공개 로그에 없음** (백엔드 비밀 변수만).
- [ ] 시트 연동 API 쓰는 경우: `GOOGLE_SHEET_URL`, 서비스 계정 공유, 필수 탭 존재.
- [ ] `python -m pytest -q`, `npm test`, `npm run build` 통과.
- [ ] 프로덕션에서 `GET /health`, 주요 화면(체크리스트, 업로드정리, 플랫폼, 브리핑) 스모크.
- [ ] CORS: `BACKEND_CORS_ORIGINS` 등 배포 URL 반영 ([README_DEPLOY.md](./README_DEPLOY.md)).

### 시트 연동 Verbose 로그 (선택)

로컬에서 시트 헤더/첫 행 디버그가 필요할 때만 `backend/.env`에 `SHEETS_VERBOSE_DEBUG=1` 설정. 미설정 시 해당 `logger.info` 디버그 줄은 출력하지 않습니다.

## 지금 앱에서 할 수 있는 것 (요약)

데이터 저장소는 **`DATA_BACKEND`** 에 따라 시트 또는 Supabase입니다 (위 표 참고).

- **체크리스트** (`/checklist`): 조회·생성·수정·완료·삭제. AI 제안(prioritize / draft). draft는 `POST /checklist/create`에 **수동** 반영.
- **업로드정리** (`/upload-rows`): 탭 기반 관리 화면 (`DATA_BACKEND` 반영).
- **레거시 업로드 운영** (`/uploads`): 시트 기반(항상). AI 제안은 시트에 자동 저장하지 않음.
- **홈·관제판** (`/`): 브리핑(`GET /briefing/today`), `/stats` 등. 관제판은 레거시 `GET /uploads`도 함께 호출할 수 있음.
- **비서** (`/assistant`): 플레이스홀더 (미연결).

## 검증 자동화 (한 번에)

저장소 **루트**에서:

| 환경 | 명령 |
|------|------|
| Windows PowerShell | `pwsh -ExecutionPolicy Bypass -File .\scripts\dev-smoke-check.ps1` 또는 `powershell -ExecutionPolicy Bypass -File .\scripts\dev-smoke-check.ps1` |
| Windows CMD | `scripts\dev-smoke-check.bat` |
| Git Bash / WSL / Unix | `./scripts/dev-smoke-check.sh` (최초 `chmod +x` 필요할 수 있음) |

**순서:** `backend` → `python -m pytest -q` → `frontend` → `npm test` → `npm run build`.

상세·복붙 명령·**한글·`[WorkSheet]` 경로 이슈**·UI 스모크 체크리스트 → **[QUICK_START_VALIDATION.md](./QUICK_START_VALIDATION.md)**.

## 수동 확인 (스모크 요약)

1. `backend/.env`, `frontend/.env.local` — 데모·프록시 권장: `OPSPROXY_TARGET=http://127.0.0.1:8001`, `NEXT_PUBLIC_API_BASE_URL` 비움. ([README_DEMO.md](./README_DEMO.md))
2. 백엔드: `backend` 폴더에서 `python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001`
3. 프론트: `frontend` 폴더에서 `npm run dev` → `http://localhost:3000`
4. 체크리스트·업로드 UI 스모크는 **QUICK_START_VALIDATION.md §5** 표를 따른다.

## 로컬 검증 명령 (단계별)

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

특정 파일만: `python -m pytest tests/test_uploads_create.py -q`

```bash
cd frontend
npm install
npm test
npm run build
```

**Windows PowerShell:** 경로에 **`[` `]`** 가 있으면 `cd` 대신 `Set-Location -LiteralPath '전체경로'` 를 쓰거나 **QUICK_START_VALIDATION.md §3**을 본다. Cursor/IDE 터미널에서 한글 경로가 깨지면 **탐색기에서 해당 폴더 연 터미널** 또는 **영문 짧은 경로로 클론**을 권장한다.

---

## 필요 조건

- **Node.js** 20 이상 권장 (Next.js 16)
- **Python** 3.11 이상 권장

## 백엔드 실행

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

동작 확인: `http://127.0.0.1:8001/health` → `{"status":"ok"}`. 로컬 첫 실행 순서는 위 **「초보자용: 로컬에서 한 번에 띄우기」** 절을 권장합니다.

### Google Sheets — 체크리스트 (`GET /checklist`)

1. GCP 서비스 계정 JSON 키, Sheets API 사용 설정.  
2. 스프레드시트를 서비스 계정 `client_email`에 **뷰어** 이상 공유.  
3. 탭 **「체크리스트」**(`GOOGLE_CHECKLIST_TAB`): **2행부터** `A=id`, `B=title`, `C=note`, `D=상태`. `D=완료`면 목록에서 제외. 쓰기(완료/수정/삭제/생성)는 **편집자** 이상.  
4. `backend/.env`: `GOOGLE_SERVICE_ACCOUNT_FILE`, `GOOGLE_SHEET_URL`, (선택) `GOOGLE_CHECKLIST_TAB`.

에러 문구 접두: `[설정]` `[Sheets API]`·`[공유]` `[파싱]` `[찾을수없음]` 등 — 상세는 `current_app_status_report.md` §4.

### Google Sheets — 업로드 (`GET /uploads`)

- 동일 스프레드시트 URL·키 사용.  
- 탭 **「업로드운영」**(`GOOGLE_UPLOADS_TAB`).  
- **2행부터** `A=id`, `B=title`, `C=file_name`, `D=uploaded_at`, `E=note`, **`F=status`**.  
- `title`이 있는 행은 `C`·`D`가 비면 조회 시 `[파싱]` 오류로 중단될 수 있음(생성 API는 빈 C·D에 기본값 부여).

### OpenAI (선택)

- `POST /ai/checklist/suggest`, `POST /ai/uploads/suggest` — `OPENAI_API_KEY` 등은 `backend/.env.example` 참고.  
- AI 응답은 시트에 **자동 저장되지 않음**.

`GET /briefing/today`: `supabase` 모드에서는 체크리스트·**업로드정리(`upload_rows`)** 기준으로 집계합니다. 레거시 업로드운영 시트는 사용하지 않습니다.

## 프론트엔드 실행

```bash
cd frontend
npm install
```

`frontend/.env.local` (권장: 백엔드는 `/api/ops` 프록시만 사용 — 외부 데모는 [README_DEMO.md](./README_DEMO.md)):

```
OPSPROXY_TARGET=http://127.0.0.1:8001
# NEXT_PUBLIC_API_BASE_URL=   ← 비우면 브라우저·서버 모두 /api/ops 경유
```

```bash
npm run dev
```

브라우저: `http://localhost:3000` — 홈 브리핑·헬스, 하단 네비로 체크리스트·업로드·비서·설정.

## 프로덕션 빌드 (프론트)

```bash
cd frontend
npm run build
npm run start
```

## 폴더 구조 요약

- `frontend/` — Next.js + TypeScript + Tailwind (`src/app`, `src/components`, `src/lib`)
- `backend/` — FastAPI, `services/`에 Sheets·AI 로직
