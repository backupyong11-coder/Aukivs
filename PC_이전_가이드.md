# PC 이전 가이드 (WorkSheet / Aukivs)

> **다른 컴퓨터에서 10~15분 안에** 로컬 개발 + 운영 배포를 이어가기 위한 문서입니다.  
> 상세 레퍼런스: [HANDOVER.md](./HANDOVER.md) · 빠른 요약: [CONTINUE.md](./CONTINUE.md)

---

## 0. 한눈에 (운영 구조)

```
브라우저 → Vercel (Next.js) → /api/ops 프록시 → Fly.io (FastAPI) → Supabase (Postgres)
```

| 구분 | 주소 / 이름 |
|------|-------------|
| GitHub | https://github.com/backupyong11-coder/Aukivs (`master`) |
| Fly API | https://backend-patient-wave-707.fly.dev |
| Fly 앱 | `backend-patient-wave-707` |
| 헬스 확인 | https://backend-patient-wave-707.fly.dev/health → `"bundle":"worksheet-ops-cloud-deploy-v2-tasks-schema"` |
| Vercel | 대시보드 → 프로젝트 Domains (프론트 URL) |
| Supabase | `backend/.env`의 `SUPABASE_URL` 프로젝트 |

---

## 1. 옛 PC에서 나가기 전 (필수)

### 1-1. Git push

```powershell
cd "N:\오키브스 앱\WorkSheet"   # 실제 경로
git status
git add …                      # .env 는 절대 add 하지 말 것
git commit -m "…"
git push origin master
```

### 1-2. Git에 없는 파일 — USB·암호관리자·클라우드로 복사

| 파일 | 필수 | 내용 |
|------|------|------|
| `backend/.env` | **필수** | `DATA_BACKEND`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등 |
| `frontend/.env.local` | **필수** | `DEMO_PIN`, `OPSPROXY_TARGET` |
| Google 서비스 계정 JSON | 시트 모드 시 | `GOOGLE_SERVICE_ACCOUNT_FILE` 경로의 파일 |
| `C:\Users\<이름>\.fly\config.yml` | Fly 배포 시 | `flyctl auth login` 대체 가능 |

**절대 Git·Vercel·공개 채팅에 넣지 말 것:** `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, Google JSON, `DEMO_PIN`

### 1-3. (선택) Fly CLI 로그인

```powershell
flyctl auth login
```

---

## 2. 새 PC — 최초 1회 설치

### 2-1. 프로그램

| 도구 | 용도 | 확인 |
|------|------|------|
| Git | clone/pull | `git --version` |
| Node.js 20+ | 프론트 | `node -v` |
| Python 3.12+ | 백엔드 | `python --version` |
| Cursor | IDE | 동일 계정 로그인 |

```powershell
# Fly CLI (백엔드 배포용, 선택)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
# PowerShell 재시작 후
flyctl version
```

### 2-2. 저장소 clone

```powershell
git clone https://github.com/backupyong11-coder/Aukivs.git
cd Aukivs
git pull origin master
```

한글 경로(`N:\오키브스 앱\WorkSheet`)를 쓰면 Git safe.directory:

```powershell
git config --global --add safe.directory "N:/오키브스 앱/WorkSheet"
```

### 2-3. 자동 셋업 스크립트

```powershell
cd Aukivs
powershell -ExecutionPolicy Bypass -File .\scripts\setup-new-pc.ps1
```

### 2-4. 환경 파일 붙여넣기

1. `backend/.env.example` → `backend/.env` (옛 PC에서 복사한 값으로)
2. `frontend/.env.example` → `frontend/.env.local`

**로컬 개발 권장값 (`frontend/.env.local`):**

```env
DEMO_PIN=(운영과 동일 또는 로컬용)
OPSPROXY_TARGET=http://127.0.0.1:8001
# NEXT_PUBLIC_API_BASE_URL 는 비워 두기
```

**백엔드 (`backend/.env`) 최소:**

```env
DATA_BACKEND=supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 3. 매일 실행 (로컬)

**터미널 1 — 백엔드**

```powershell
cd backend
python -m pip install -r requirements-dev.txt   # 최초 또는 requirements 변경 시
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

→ http://127.0.0.1:8001/health

**터미널 2 — 프론트**

```powershell
cd frontend
npm install    # 최초 또는 package.json 변경 시
npm run dev
```

→ http://localhost:3000 (PIN 게이트 있으면 `/demo-login`)

---

## 4. 배포

### 프론트 (Vercel)

- `master` push → 보통 **자동 배포**
- Vercel 환경 변수: `OPSPROXY_TARGET=https://backend-patient-wave-707.fly.dev`, `DEMO_PIN`

### 백엔드 (Fly) — **API/DB 스키마 변경 시 필수**

Git push만으로 Fly는 **자동 갱신되지 않을 수 있음**. 반드시:

```powershell
cd backend
flyctl auth login    # 또는 옛 PC의 ~/.fly/config.yml 복사
flyctl deploy --app backend-patient-wave-707 --remote-only
```

배포 확인:

```powershell
curl https://backend-patient-wave-707.fly.dev/health
curl https://backend-patient-wave-707.fly.dev/tasks
```

GitHub Actions 자동 배포: 저장소 Secrets에 `FLY_API_TOKEN` 등록 (`.github/workflows/fly-deploy.yml`).

---

## 5. Supabase 마이그레이션

SQL 파일: `supabase/migrations/`

| 파일 | 내용 |
|------|------|
| `001` ~ `005` | 초기 스키마·인덱스·대분류·주간아젠다·열 너비 |
| **`006_task_work_assignee.sql`** | `status`+`assignee` → **`work_assignee`** (업무담당) |

**이미 운영 DB에 006 적용됨** (2026-05). 새 clone만으로는 DB가 자동 적용되지 않음 — Supabase SQL Editor에서 순서대로 실행.

로컬에서 CLI 적용 (DB 비밀번호 필요):

```powershell
pip install psycopg2-binary python-dotenv
# backend/.env 에 SUPABASE_DB_PASSWORD 추가 후
python backend/scripts/apply_supabase_migration.py 006_task_work_assignee
```

---

## 6. 최근 기능 (2026-05, master 기준)

| 메뉴 | 경로 | API | 비고 |
|------|------|-----|------|
| 업무정리 | `/tasks` | `/tasks` | **`업무담당`** (= `work_assignee`) |
| 인물별 | `/personnel` | `/tasks` + 인물 보드 | 직원별 할 일 대시보드 |
| 지속진행 | `/progress` | `/platform-rows` | **보류** 탭 = 플랫폼정리 `보류` 체크 |
| 플랫폼정리 | `/platforms` | `/platform-rows` | `보류`·`진행` extra 열 |
| 계약·런칭·업로드·발표일 | 각 경로 | platform/upload rows | HANDOVER §0 표 참고 |

**주의 (업무정리 장애 재발 방지):**

- Supabase `006` 적용 후 Fly가 **구버전**이면 `column tasks.status does not exist` → **`flyctl deploy`**
- `/health`의 `bundle`이 `v2-tasks-schema`인지 확인

---

## 7. Cursor에서 이어하기

1. Cursor **같은 계정** 로그인
2. 프로젝트 폴더 열기
3. **새 Agent 채팅** (옛 대화는 안 넘어옴)
4. [CURSOR_시작프롬프트.md](./CURSOR_시작프롬프트.md) 내용 붙여넣기

---

## 8. 안 넘어오는 것

| 항목 | 대응 |
|------|------|
| Cursor 채팅 기록 | 새 채팅 + 이 문서 |
| 브라우저 localStorage (열 순서·필터) | PC마다 따로 |
| 미 push 커밋 | push 후 이동 |
| `.env` / `.env.local` | 수동 복사 |

---

## 9. 자주 쓰는 명령

```powershell
git pull origin master
git log -5 --oneline

cd frontend && npm run build          # 배포 전 타입/빌드 검사
cd backend && python -m pytest      # 백엔드 테스트

flyctl deploy --app backend-patient-wave-707 --remote-only
```

---

## 10. 문제 해결

| 증상 | 확인 |
|------|------|
| 업무정리 DB 400 / `status does not exist` | Fly `/health` bundle, `flyctl deploy` |
| API 연결 실패 | `frontend/.env.local`의 `OPSPROXY_TARGET`, 백엔드 8001 실행 여부 |
| PIN 안 됨 | `DEMO_PIN` 로컬·Vercel 일치 |
| 지속진행 보류 탭 비음 | 플랫폼정리 `보류` 체크 + Fly/Vercel 최신 배포 |
| Git 한글 경로 오류 | `safe.directory` 설정 |

---

*최종 갱신: 2026-05-28 · master `82c9840` 근처*
