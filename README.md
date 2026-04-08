# 개인용 운영 비서

Next.js(App Router) 프론트와 FastAPI 백엔드가 분리된 구조입니다. 민감한 키는 프론트에 두지 않습니다.

## 인수인계·현황 문서 (최신)

| 문서 | 용도 |
|------|------|
| [**README_DEPLOY_FINAL.md**](./README_DEPLOY_FINAL.md) | **배포 직전 마감**: 로컬 체크리스트, Railway/Vercel 클릭 순서, env 복붙, 공유 문구 |
| [**README_DEPLOY.md**](./README_DEPLOY.md) | **클라우드 상시 배포**: Vercel(프론트) + Railway/Render(백엔드), 환경 변수, Google JSON, 초보 순서 |
| [**QUICK_START_VALIDATION.md**](./QUICK_START_VALIDATION.md) | **5분 검증**: 자동 스크립트, 수동 명령, Windows 한글·`[]` 경로 대응, UI 스모크 체크리스트 |
| [MANUAL_LIVE_VERIFICATION_LOG.md](./MANUAL_LIVE_VERIFICATION_LOG.md) | **실제 Sheets/OpenAI** 연결 후 브라우저 수동 검증 결과 기록용 표 |
| [current_app_status_report.md](./current_app_status_report.md) | 기능 완료/검증/보류 표, 에러 원칙, 운영 플로우 |
| [FULL_HANDOFF_AND_NEXT_STEPS.md](./FULL_HANDOFF_AND_NEXT_STEPS.md) | API·라우트 요약, 다음 작업 순서, 다음 채팅용 붙여넣기 문단 |

## 지금 앱에서 할 수 있는 것 (요약)

- **체크리스트** (`/checklist`): 시트 연동 조회·생성·수정·완료·삭제. AI 제안(prioritize / draft). draft는 **단건 또는 선택 일괄**로 `POST /checklist/create`에 반영 (자동 반영 아님).
- **업로드** (`/uploads`): 조회·생성·수정·삭제·다음 회차. AI 제안(prioritize / review)은 시트에 쓰지 않음. 추천 행에서 **카드로 이동·수정 열기·다음 회차·삭제**까지 연결 (모두 사용자 확인 후 실행).
- **홈** (`/`): `GET /briefing/today` 브리핑 + `GET /health`.
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

동작 확인: `http://127.0.0.1:8001/health` → `{"status":"ok"}`.

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

`GET /briefing/today`는 체크리스트·업로드를 읽어 집계합니다.

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
