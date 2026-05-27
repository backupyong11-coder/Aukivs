# WorkSheet 인수인계서

웹툰 운영 관제실 프로젝트를 처음 맡을 때 **이 문서만** 보면 로컬 실행·온라인 배포·자주 나는 오류를 빠르게 처리할 수 있습니다.

---

## 0. 다른 PC에서 작업 이어하기 (A컴 → B컴)

> **같은 Cursor 계정**만으로는 **채팅·Agent 대화**가 B PC로 넘어가지 않습니다.  
> **Git + 이 문서 + (선택) 새 Cursor 채팅** 으로 이어가세요.

### 0-1. A컴에서 나가기 전 (필수)

```powershell
cd c:\Coding\WorkSheet
git status
git add -A          # 커밋할 파일만 골라도 됨. .env 는 절대 제외
git commit -m "..."
git push origin master
```

- 작업 중이던 **미커밋 변경**은 B에 없습니다.
- `frontend/.env.local`, `backend/.env` 는 Git에 없음 → **USB·암호관리자·팀 공유**로 B에 복사.

### 0-2. B컴에서 시작 (필수)

```powershell
git clone https://github.com/backupyong11-coder/Aukivs.git
# 이미 clone 되어 있으면:
cd WorkSheet   # 또는 실제 폴더명
git pull origin master
```

```powershell
# 백엔드
cd backend
# .env 붙여넣기 후
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001

# 프론트 (다른 터미널)
cd frontend
npm install    # 최초 1회 또는 package.json 변경 후
# .env.local 붙여넣기 후
npm run dev
```

### 0-3. Cursor에서 이어서 말하는 법

1. B PC에서 **같은 계정**으로 Cursor 로그인
2. `WorkSheet` 폴더 열기
3. **새 Agent/Chat** 열기 (A의 대화는 안 보임)
4. 첫 메시지 예시:

   > `HANDOVER.md` 0·6절 읽고 이어서 작업해줘.  
   > 지금 master는 `git log -1` 기준 최신이야.  
   > (하고 싶은 일 한 줄)

### 0-4. B PC에 안 따라오는 것

| 항목 | 설명 |
|------|------|
| Cursor **채팅/Agent 기록** | PC·워크스페이스 로컬 |
| **열 순서·태그 숨김** | 브라우저 `localStorage` (PC마다 따로) |
| **필터 패널 접힘** | 기본 접힘은 코드 기본값; 그룹별 접힘은 세션마다 |
| **미커밋 파일** | push 안 하면 없음 |

### 0-5. 현재 master 최근 작업 (2026-05-27)

프론트 **정리 화면 UX 통일** (배포: `master` push → Vercel 자동):

| 메뉴 | 경로 | 데이터 API | 주요 파일 |
|------|------|------------|-----------|
| 업무정리 | `/tasks` | `GET/POST /tasks` | `TasksClient.tsx` |
| 업로드정리 | `/upload-rows` | `/upload-rows` | `UploadRowsClient.tsx` |
| 플랫폼정리 | `/platforms` | `/platform-rows` | `PlatformRowsClient.tsx` |
| 계약정리 | `/contracts` | `/platform-rows` | `ContractsClient.tsx` |
| 런칭정리 | `/launching` | `/upload-rows` | `LaunchingClient.tsx` |
| 현재진행 | `/progress` | `/platform-rows` | `CurrentProgressClient.tsx` |
| 발표일 | `/announcement-date` | `/platform-rows` | `AnnouncementDateClient.tsx` |

**공통 UX**

- 셀 호버/클릭 **인라인 수정** (`PlatformRowInlineCell` / `UploadRowInlineCell`)
- 체크박스·불리언 변경 시 **되돌리기** (토스트 + Ctrl+Z + 상단 버튼)
- 헤더 **⋮⋮** 드래그로 **열 순서** 변경 (`localStorage`, 페이지별 키 — 아래 6-3)
- **태그 필터** 공통: `frontend/src/components/FilterTagsFlow.tsx`  
  - 그레이 칩, 그룹별 접기, **전체 패널 접기(기본: 접힘)**, 왼쪽 상단 작은 ▼

**데이터 메모**

- **현재진행·발표일·계약정리·플랫폼정리** → 같은 `platform_rows` (시트 탭: 플랫폼정리)
- **런칭·업로드정리** → `upload_rows`
- **업무정리** → `tasks`

**최근 커밋 (참고, 최신 → 과거)**

```
ab781df feat(tables): single-click cell edit; priority column as notion-style tags
3cf3eac feat(tables): undo column hide restores visible attributes on all list views
36c3286 fix(tables): restore header menu clicks after truncate layout change
736d2f7 fix(tables): truncate long cell text, click for full preview, keep column resize
bf93a65 feat(tables): mini calendar picker for date columns on platform, upload, launching views
dcacd9d fix(tables): let columns shrink to label plus menu, not default 112px
2a3f1db fix(tables): show full column labels; header actions in one menu
1995bd5 feat(tables): persist column widths to Supabase (shared across browsers)
f21668b feat(tables): drag-resize column widths on all list pages
e468e6e feat(tables): add data column '대분류' on all list pages
```

### 0-6. 다음에 하면 좋은 것 (미정)

- 체크리스트·마일스톤 등 나머지 메뉴에 동일 테이블 UX 적용 여부는 **요청 시**
- 백엔드 변경 없이 프론트만 수정한 경우 **Vercel만** 갱신되면 됨 (`git push` → 자동)

---

## 1. 한눈에 보는 구조

```
[브라우저]
    ↓
Vercel (화면, Next.js)          로컬: http://localhost:3000
    ↓  /api/ops/* 프록시
Fly.io (API, FastAPI)            https://backend-patient-wave-707.fly.dev
    ↓
Supabase (DB)                   메모·업무·체크리스트 등
```

| 구분 | 역할 | 주소/위치 |
|------|------|-----------|
| **프론트** | 화면, PIN 게이트, API 프록시 | Vercel / `frontend/` |
| **백엔드** | REST API (`/memos`, `/hub/*` 등) | Fly.io / `backend/` |
| **DB** | 데이터 저장 | Supabase (`DATA_BACKEND=supabase`) |

**중요:** Supabase는 **DB만** 담당합니다. 브라우저는 Supabase에 직접 붙지 않고, 항상 Fly API를 거칩니다.

---

## 2. 저장소·주요 경로

| 경로 | 설명 |
|------|------|
| `frontend/` | Next.js 앱 (Vercel 루트 디렉터리) |
| `backend/` | FastAPI (`main.py`, `fly.toml`) |
| `frontend/.env.local` | 로컬 프론트 환경 변수 (Git 제외) |
| `backend/.env` | 로컬 백엔드 환경 변수 (Git 제외) |
| `frontend/next.config.ts` | `/api/ops` → `OPSPROXY_TARGET` rewrite |
| `frontend/src/proxy.ts` | `DEMO_PIN` 있을 때 PIN 게이트 |
| `render.yaml` | Render 배포용 (선택, **현재 운영은 Fly**) |

GitHub: `backupyong11-coder/Aukivs` (브랜치 `master`)

---

## 3. 로컬 실행 (매일 개발할 때)

### 3-1. 환경 변수

**`backend/.env`** (필수 예시, Supabase 사용 시)

```env
DATA_BACKEND=supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 절대 프론트·Git에 넣지 말 것
```

**`frontend/.env.local`** (권장)

```env
DEMO_PIN=본인PIN
OPSPROXY_TARGET=http://127.0.0.1:8001
# NEXT_PUBLIC_API_BASE_URL 는 비우기(권장). 넣으면 브라우저가 8001로 직접 호출함.
```

### 3-2. 터미널 2개 (둘 다 켜 둔 채 유지)

**터미널 1 — 백엔드**

```powershell
cd c:\Coding\WorkSheet\backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

확인: http://127.0.0.1:8001/health → `{"status":"ok",...}`

**터미널 2 — 프론트**

```powershell
cd c:\Coding\WorkSheet\frontend
npm run dev
```

확인: http://localhost:3000 → `Ready`, 포트 **3000**

> `일괄 작업을 끝내시겠습니까` → Ctrl+C 눌렀을 때. 서버 유지하려면 **N**.

> 포트 3000이 이미 쓰이면 예전 `npm run dev`가 남은 것. `taskkill /PID (PID번호) /F` 후 다시 실행.

### 3-3. PIN

`DEMO_PIN` 설정 시 첫 접속 → `/demo-login`. 로컬은 `frontend/.env.local`의 PIN과 동일하게 입력.

---

## 4. 온라인(운영) 주소

| 항목 | 값 |
|------|-----|
| **Fly API (백엔드)** | https://backend-patient-wave-707.fly.dev |
| **헬스 체크** | https://backend-patient-wave-707.fly.dev/health |
| **Vercel (프론트)** | Vercel 대시보드 → 프로젝트 Domains 에서 확인 |
| **Fly 앱 이름** | `backend-patient-wave-707` |

**Vercel 환경 변수 (Production)**

| 변수 | 값 |
|------|-----|
| `OPSPROXY_TARGET` | `https://backend-patient-wave-707.fly.dev` (끝 `/` 없음) |
| `DEMO_PIN` | 운영용 PIN |
| `NEXT_PUBLIC_API_BASE_URL` | **설정하지 않음** (비우기) |

---

## 5. 배포 방법

### 5-1. 백엔드 → Fly.io (코드 바꿨을 때)

PC에 `flyctl` 설치 (최초 1회):

```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**PowerShell 새로 연** 후:

```powershell
$env:Path += ";$env:USERPROFILE\.fly\bin"
flyctl auth login
cd c:\Coding\WorkSheet\backend
flyctl deploy
```

> 명령은 `fly`가 아니라 **`flyctl`**. PATH 오타 주의: `$env:USERPROFILE` (`$` 필수)

배포 후: `/health` 확인 → Vercel **Redeploy**.

### 5-2. 프론트 → Vercel

1. GitHub `master`에 push
2. Vercel 대시보드 → **Deployments** → **Redeploy**  
   (또는 Git 연동 시 push만으로 자동 배포)

CLI 사용 시: Vercel 로그인 필요 (`vercel login`). 프로젝트 루트는 **`frontend`**.

### 5-3. 배포 순서 (항상)

1. **Fly `flyctl deploy`** (백엔드)
2. **Vercel Redeploy** (프론트)

---

## 6. 최근 중요 변경

### 6-1. 정리 화면 테이블·태그 필터 (2026-05-26)

**공통 컴포넌트**

| 파일 | 역할 |
|------|------|
| `frontend/src/components/FilterTagsFlow.tsx` | 태그 필터 UI (전체/그룹 접기, 그레이 칩) |
| `frontend/src/components/PlatformRowInlineCell.tsx` | 플랫폼 행 인라인 편집 |
| `frontend/src/components/UploadRowInlineCell.tsx` | 업로드 행 인라인 편집 |

**페이지별 태그 필터 항목**

| 페이지 | 태그 그룹 |
|--------|-----------|
| 업무정리 | 우선순위, 분야, 분류, 플랫폼 |
| 업로드정리 | 플랫폼, 작품명 |
| 플랫폼정리 | 발표일, 분류, 플랫폼명 |
| 계약정리 | 계약, 회사명, 플랫폼명 |
| 런칭정리 | 플랫폼명, 작품명, 업로드완료여부 |
| 현재진행 | 분류, 플랫폼명 |
| 발표일 | 분류, 마지막상황 |

**열 순서 localStorage 키 (예시)**

| 페이지 | 키 |
|--------|-----|
| 플랫폼정리 | `platform_rows_col_order_v2` |
| 계약정리 | `contracts_col_order_v1` |
| 런칭정리 | `launching_col_order_v1` |
| 현재진행 | `current_progress_col_order_v1` |
| 발표일 | `announcement_date_col_order_v1` |
| 업무정리 | `tasks_col_order_v1` |
| 업로드정리 | `upload_rows_col_order_v1` |

**목록 표시·기간 필터** (7개 정리 화면 공통, `TableListControls`):

| 항목 | 설명 |
|------|------|
| 기본 표시 | 전체·10·25·50·100·200·300·500건 |
| 더보기 | 잘린 건수 펼치기 |
| 기간 | 전체 / 오늘 / 이번 주 / 이번 달 / 직접(날짜) / 1·3·6·12개월 (한 줄 UI, 캘린더 `calendarWindow`와 동일·롤링) |
| 저장 키 | `table_list.{페이지id}.pageSize`, `table_list.{페이지id}.dateRange` |

태그 숨김은 `*.hidden.{필드명}` 형태 (예: `contracts.hidden.계약`).

### 6-2. 속도 개선 — Hub API

챗봇·캘린더·플랫폼 매트릭스가 무거운 전체 허브 대신 경량 API 사용:

| 화면 | API |
|------|-----|
| 챗봇 | `GET /hub/chatbot-context` |
| 캘린더 | `GET /hub/calendar-window?from_ymd=&to_ymd=` |
| 플랫폼 매트릭스 | `GET /hub/platform-matrix-bootstrap` |

프론트: `frontend/src/lib/chatbotContext.ts`, `calendarWindow.ts`, `platformMatrixBootstrap.ts`  
백엔드: `backend/main.py`, `backend/repositories/snapshot_repo.py`

Hub 404/405 시 **레거시 API로 자동 폴백** (프론트).

### 6-3. 메모 삭제

- **이전:** `DELETE /memos` + JSON body → Vercel/Fly 프록시에서 실패하는 경우 많음
- **현재:** `POST /memos/delete` (권장)
- 프론트: `frontend/src/lib/memos.ts` → `deleteMemo()` 가 POST 사용
- 백엔드: `backend/main.py` → `post_memos_delete`, `_delete_memo_impl`

**온라인에서 삭제 안 되면** → Fly에 **옛 이미지**가 떠 있는 경우가 대부분. `flyctl deploy` 필요.

### 6-4. 정리(표) 화면 — 속성(열) UX (2026-05-27)

#### 6-4-1. 열(속성) 헤더

- 헤더 오른쪽 액션은 **⋯ 메뉴 1개**로 통합 (정렬/숨기기/이름편집/제거).
- **이름 편집**은 *표시 이름만* 바뀜 (DB 컬럼명/시트 헤더는 안 바뀜).
- 열 순서: 헤더 왼쪽 **⋮⋮ 드래그** (페이지별 localStorage 키, §6-1 참조).
- 열 너비: 오른쪽 **드래그**로 조절. 너무 좁게 저장된 너비도 화면에서는 최소 너비 보정.

#### 6-4-2. 열 너비 온라인 공유 저장(Supabase)

- 프론트는 `GET/PUT /table-list-preferences/{page_id}`로 열 너비를 읽고 씀.
- Supabase에 `table_list_preferences` (migration `supabase/migrations/005_table_list_preferences.sql`)가 있어야 함.
- 백엔드(Fly) secrets에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 있어야 저장됨.

#### 6-4-3. 날짜 미니 달력(시트/엑셀 스타일)

클릭 시 미니 달력으로 날짜 선택(YYYY-MM-DD 저장):
- 플랫폼 계열: `발표일`
- 업로드/런칭 계열: `업로드일`, `런칭일`, `마지막업로드일`, `다음업로드일`

관련 파일:
- `frontend/src/components/SheetMiniCalendar.tsx`
- `frontend/src/components/SheetDateInlineCell.tsx`
- `frontend/src/lib/tableDateFields.ts`

#### 6-4-4. 긴 텍스트(줄임표) + 열 너비 조절

- 셀 내용이 길어도 열 너비 드래그가 막히지 않도록 `max-w-0`+`truncate`로 고정.

#### 6-4-5. 되돌리기(Undo) — 열 숨기기 포함

- 완료 체크/불리언 변경처럼, **열 숨기기**도 토스트가 뜨고 `되돌리기`/`Ctrl+Z`로 다시 표시됨.
- 공통 유틸: `frontend/src/lib/tableListUndo.ts`

#### 6-4-6. 우선순위 태그(노션식)

- `우선순위`는 입력 대신 태그 선택 UI.
- 기본 태그: `오키브스`, `업체`, `없음`, `논의`
- 태그 추가는 가능(브라우저 localStorage 저장, PC/브라우저별로 다름)

관련 파일:
- `frontend/src/components/TagSelectInlineCell.tsx`
- `frontend/src/lib/priorityTags.ts`

#### 6-4-7. 셀 클릭 동작

- 셀은 **한 번 클릭**으로 바로 편집(입력) 시작.
- (표시 이름 편집/열 숨기기 등은 헤더 ⋯ 메뉴에서)

---

## 7. 자주 나는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| 로컬 메뉴/삭제 안 됨 | 백엔드 안 켬 또는 **재시작 안 함** | uvicorn 다시 실행 (`--reload` 권장) |
| `POST /memos/delete` 404 (Fly) | Fly 미배포 | `flyctl deploy` |
| 「/memos/append 연결 확인」 (삭제 시) | 옛 백엔드 또는 DELETE 실패 | Fly deploy + 프론트 최신 |
| 챗봇 빈 화면 잠깐 | 로딩 전 idle (수정됨) | 프론트 최신, 새로고침 |
| Vercel API 401 | DEMO_PIN 없이 접속 | `/demo-login` 에서 PIN |
| `fly` / `flyctl` 인식 안 됨 | PATH 미반영 | PowerShell **새로 열기** 또는 `$env:Path += ";$env:USERPROFILE\.fly\bin"` |
| `Port 3000 in use` | 예전 next dev | 해당 PID 종료 후 재실행 |
| 온라인만 안 됨 | Vercel만 최신, Fly 구버전 | **Fly deploy 먼저** |

---

## 8. 테스트·빌드

```powershell
# 백엔드
cd backend
python -m pytest -q

# 프론트
cd frontend
npm test
npm run build
```

---

## 9. 사이드바 메뉴 (AppNav)

경로는 `frontend/src/components/AppNav.tsx`에 고정:

- `/` 관제실, `/chatbot` 챗봇, `/memo` 메모, `/calendar` 캘린더, `/platform-matrix` 플랫폼  
메뉴 링크가 안 보이면 **페이지 내용(API 실패)** 문제인 경우가 많음. AppNav 자체는 거의 안 지움.

---

## 10. 더 읽을 문서

| 문서 | 내용 |
|------|------|
| [README.md](./README.md) | 프로젝트 개요·로컬 실행 |
| [README_DEMO.md](./README_DEMO.md) | PIN·프록시 설명 |
| [README_DEPLOY.md](./README_DEPLOY.md) | Vercel·배포 상세 |
| [README_DEPLOY_FINAL.md](./README_DEPLOY_FINAL.md) | 배포 체크리스트 |

---

## 11. 인수인계 체크리스트 (새 담당자)

- [ ] `backend/.env`, `frontend/.env.local` 받았는지
- [ ] Supabase URL·Service Role Key 동작 확인
- [ ] 로컬: uvicorn 8001 + npm run dev 3000
- [ ] http://localhost:3000/memo 에서 삭제 테스트
- [ ] Fly `/health` OK
- [ ] Vercel `OPSPROXY_TARGET` = Fly URL
- [ ] Vercel 운영 PIN 전달 방식 합의
- [ ] Fly·Vercel 대시보드 접근 권한

---

*마지막 정리: 2026-05-27 — 열 너비/헤더 ⋯ 메뉴/날짜 달력/긴 텍스트 줄임표/우선순위 태그/열 숨기기 undo*
