# 상시 데모 배포 가이드 (Vercel + Railway / Render)

**배포 직전 체크리스트·클릭 순서·복붙 env만 필요하면** → [README_DEPLOY_FINAL.md](./README_DEPLOY_FINAL.md)

PC를 켜 두지 않아도 되는 **클라우드 상시 접속** 구조입니다.  
**정식 로그인(회원)** 은 없고, **공용 PIN** 으로만 Next.js 앱에 들어갑니다.  
백엔드 URL은 방문자에게 숨기고, 브라우저는 **프론트 도메인**과 `/api/ops` 프록시만 사용하는 것을 권장합니다.

---

## 아키텍처 한눈에

| 구분 | 플랫폼 | 역할 |
|------|--------|------|
| 프론트 | **Vercel** | Next.js, 데모 PIN 게이트, `/api/ops` → 백엔드로 서버 프록시 |
| 백엔드 | **Railway** (또는 **Render**) | FastAPI, Google Sheets, OpenAI |

방문자가 받는 것: **프론트 HTTPS URL** + **PIN** (백엔드 주소는 알려 줄 필요 없음).

---

## 1) Vercel용 준비사항

1. **GitHub(또는 GitLab/Bitbucket)** 에 이 저장소를 푸시해 두었다.
2. [Vercel](https://vercel.com) 계정으로 로그인 → **Add New Project** → 해당 저장소 선택.
3. **Root Directory** 를 `frontend` 로 지정한다. (프로젝트 루트가 아니라 `frontend` 폴더.)
4. Framework Preset 은 Next.js 로 자동 인식되면 그대로 둔다.
5. **Environment Variables** 에 아래 [환경 변수 표](#전체-환경변수-표)의 **Vercel** 행을 넣는다.  
   특히 `OPSPROXY_TARGET` 은 **Railway/Render에서 나온 백엔드 공개 URL**(예: `https://xxx.up.railway.app`, 끝에 `/` 없음)으로 설정한다.
6. **Deploy** 후 발급되는 URL이 **프론트 URL**이다 (예: `https://worksheet-xxx.vercel.app`).
7. 백엔드의 CORS에 이 프론트 URL을 넣는다 (`BACKEND_CORS_ORIGINS`).

**주의**

- `OPSPROXY_TARGET` 은 **서버 전용**이다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다. (클라이언트 번들에 노출되면 안 됨.)
- `NEXT_PUBLIC_API_BASE_URL` 은 **비워 둔다**. 비우면 브라우저는 항상 같은 출처의 `/api/ops` 만 호출한다.

---

## 2) Railway용 준비사항 (추천)

1. [Railway](https://railway.app) 계정으로 로그인 → **New Project** → **Deploy from GitHub repo** (또는 Empty project 후 Git 연결).
2. 서비스 **Root** 또는 **Working Directory** 를 `backend` 로 맞춘다.
3. **Settings → Deploy** 에서 Start Command 가 없으면 다음을 넣는다:

   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

   저장소에 `backend/Procfile` 이 있으면 Railway가 `web` 프로세스를 인식할 수 있다. 포트는 플랫폼이 주는 **`PORT`** 를 쓴다.

4. **Variables** 에 [백엔드 환경 변수](#전체-환경변수-표)를 모두 입력한다.
5. 배포가 끝나면 **Public Networking** 을 켜고, 생성된 **HTTPS URL**을 복사한다 → 이것이 Vercel의 `OPSPROXY_TARGET` 값이다.

---

## 2-보) Render 대안

1. [Render](https://render.com) → **New +** → **Web Service** → 저장소 연결.
2. **Root Directory**: `backend`
3. **Build Command**: `pip install -r requirements.txt`
4. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. **Health Check Path**: `/health` (선택, 권장)
6. 저장소 루트의 `render.yaml` 은 Blueprint 예시로 참고 가능하다.

환경 변수는 Railway와 동일하게 넣으면 된다.

---

## 전체 환경변수 표

### Vercel (`frontend` 루트 기준)

| 변수 | 필수 | 설명 |
|------|------|------|
| `DEMO_PIN` | 데모 게이트 켤 때 | 공용 PIN. 비우면 PIN 화면 없음(비권장). |
| `OPSPROXY_TARGET` | 예 | 백엔드 공개 URL, 예: `https://xxx.up.railway.app` (끝 `/` 없음). `/api/ops` 가 여기로 프록시됨. |
| `NEXT_PUBLIC_API_BASE_URL` | 아니오 | **비우기 권장.** 값이 있으면 브라우저가 백엔드에 **직접** 붙어 CORS·노출 이슈가 생김. |

로컬 전용(`frontend/.env.local`)과 동일한 이름을 쓰므로, 로컬은 `127.0.0.1:8001`, Vercel은 클라우드 백엔드 URL로만 바꾸면 된다.

### Railway / Render (`backend` 루트 기준)

| 변수 | 필수 | 설명 |
|------|------|------|
| `GOOGLE_SHEET_URL` | 예 | 스프레드시트 전체 URL. |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | 로컬 위주 | 서비스 계정 JSON **파일 경로**. 클라우드에서는 보통 비우고 아래 JSON 방식 사용. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 클라우드 권장 | 서비스 계정 JSON **전체 문자열** (아래 [자격증명](#4-credentialsjson을-배포-환경에서-처리하는-방법) 참고). |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | 선택 | JSON을 Base64로 인코딩한 값. UI가 줄바꿈을 깨뜨릴 때 사용. `JSON` 과 동시에 쓰면 **Base64 우선**. |
| `GOOGLE_CHECKLIST_TAB` | 선택 | 기본 `체크리스트` |
| `GOOGLE_UPLOADS_TAB` | 선택 | 기본 `업로드운영` |
| `GOOGLE_MEMO_TAB` | 선택 | 기본 `메모장` |
| `OPENAI_API_KEY` | 선택 | AI 제안 기능용 |
| `OPENAI_MODEL` | 선택 | 기본 `gpt-4o-mini` |
| `OPENAI_TIMEOUT_SEC` | 선택 | 기본 `45` |
| `BACKEND_CORS_ORIGINS` | 예 (배포 시) | Vercel 프론트 URL, 예: `https://my-app.vercel.app` (쉼표로 여러 개). 로컬 `localhost` 는 코드에서 기본 포함. |
| `BACKEND_CORS_ORIGIN_REGEX` | 선택 | 프리뷰 도메인까지 허용하려면 예: `https://.*\.vercel\.app` |

플랫폼이 넣어 주는 `PORT` 는 별도 설정 불필요 (Render/Railway).

---

## 4) credentials.json을 배포 환경에서 처리하는 방법

**원칙: JSON 파일을 Git에 올리지 않는다.** 서비스 계정 키는 비밀이다.

### 권장: 환경 변수로만 주입

1. 로컬에서 쓰는 `credentials.json` 파일을 연다.
2. **방법 A** — Railway/Render 변수에 키 `GOOGLE_SERVICE_ACCOUNT_JSON` 을 만들고, JSON **전체**를 한 번에 붙여 넣는다 (멀티라인 지원되는 UI면 그대로, 아니면 한 줄로 minify).
3. **방법 B** — 줄바꿈/따옴표 문제가 있으면 파일을 Base64로 인코딩해 `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` 에만 넣는다.

   PowerShell 예:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\credentials.json"))
   ```

앱이 시작될 때 백엔드가 이 값을 검증한 뒤 **임시 파일**로 풀어 두고, 기존 Sheets 코드가 그 경로를 쓰도록 맞춰 두었다 (`backend/config.py`).

### 로컬과의 분리

| 환경 | 방식 |
|------|------|
| 로컬 | `backend/.env` 에 `GOOGLE_SERVICE_ACCOUNT_FILE=...` 경로만 (JSON 파일은 디스크에만). |
| 클라우드 | `GOOGLE_SERVICE_ACCOUNT_JSON` 또는 `_BASE64` 만 설정. `GOOGLE_SERVICE_ACCOUNT_FILE` 은 비워도 됨. |

---

## 5) 배포 후 프론트가 백엔드 URL을 어떻게 바라보게 할지

- **권장 (현재 코드 구조)**  
  - 브라우저: `https://(Vercel도메인)/api/ops/...`  
  - Vercel 서버(rewrite): `OPSPROXY_TARGET` + `/...` 로 FastAPI에 전달.  
  - 따라서 방문자 브라우저에는 **백엔드 호스트가 보이지 않는다**.

- **비권장**  
  - `NEXT_PUBLIC_API_BASE_URL=https://백엔드...` 로 두면 브라우저가 백엔드에 직접 요청한다. CORS를 열어야 하고, URL이 노출된다.

백엔드 `CORS` 설정은 **혹시** 직접 호출이 생기거나 도구가 Origin 헤더를 보내는 경우를 대비해 Vercel 도메인을 허용해 두는 것이 안전하다.

---

## 6) 최종적으로 얻게 되는 URL 구조

| 항목 | 예시 | 누구에게 알려 주나 |
|------|------|-------------------|
| **프론트 URL** | `https://xxxx.vercel.app` | 참가자에게 공유 |
| **백엔드 URL** | `https://yyyy.up.railway.app` | Vercel 환경변수 `OPSPROXY_TARGET` 에만 넣고, 참가자에게는 안 알려도 됨 |
| **PIN 접속** | 프론트 URL 접속 → `/demo-login` 에서 PIN 입력 → 쿠키로 입장 유지 → 사이드바 **데모 로그아웃** 으로 종료 | `DEMO_PIN` 값을 신뢰할 수 있는 사람에게만 전달 |

---

## 초보자용: 해야 할 일 순서

1. **Google Cloud** 에서 서비스 계정 JSON을 받았고, 스프레드시트를 그 계정 이메일과 공유했다.
2. **Railway**(또는 Render)에서 `backend` 만 배포한다.  
   - 환경 변수에 `GOOGLE_SHEET_URL`, `GOOGLE_SERVICE_ACCOUNT_JSON`(또는 BASE64), `BACKEND_CORS_ORIGINS`(나중에 Vercel URL로 수정 가능) 등을 넣는다.  
   - 처음엔 CORS에 임시로 `http://localhost:3000` 만 있어도 되지만, Vercel 배포 후 **반드시** 실제 Vercel URL을 `BACKEND_CORS_ORIGINS` 에 추가한다.
3. 배포된 **백엔드 HTTPS URL**을 복사한다 (`/health` 로 브라우저에서 `{ "status": "ok" }` 확인).
4. **Vercel**에서 `frontend` 루트로 프로젝트를 만든다.  
   - `OPSPROXY_TARGET` = 위 백엔드 URL.  
   - `DEMO_PIN` = 원하는 숫자/문자열.  
   - `NEXT_PUBLIC_API_BASE_URL` 은 비운다.
5. Vercel 배포가 끝나면 **프론트 URL**을 복사해, Railway/Render의 `BACKEND_CORS_ORIGINS` 에 추가하고 백엔드를 **Redeploy** 한다.
6. 시크릿 창으로 프론트 URL 접속 → PIN 입력 → 체크리스트/업로드/메모가 동작하는지 확인한다.

---

## 로컬 vs 배포 설정 요약

| 위치 | 파일/위치 | 용도 |
|------|-----------|------|
| 로컬 프론트 | `frontend/.env.local` | `OPSPROXY_TARGET=http://127.0.0.1:8001`, `DEMO_PIN`, API URL 비움 |
| 로컬 백엔드 | `backend/.env` | `GOOGLE_SERVICE_ACCOUNT_FILE`, 시트 URL 등 (Git 제외) |
| Vercel | 대시보드 Environment Variables | 위 표 참고 |
| Railway/Render | 대시보드 Variables | 위 표 참고, JSON은 변수로 |

---

## 관련 파일

- `frontend/next.config.ts` — `/api/ops` → `OPSPROXY_TARGET`
- `frontend/src/proxy.ts` — `DEMO_PIN` 게이트 (Next.js 16 `proxy`)
- `backend/main.py` — CORS (`BACKEND_CORS_ORIGINS`, `BACKEND_CORS_ORIGIN_REGEX`)
- `backend/config.py` — `GOOGLE_SERVICE_ACCOUNT_JSON` / `_BASE64` → 임시 파일
- `backend/Procfile` — Railway/Heroku 계열 시작 명령
- `render.yaml` — Render Blueprint 예시

자세한 로컬 데모는 [README_DEMO.md](./README_DEMO.md)를 참고한다 (로컬 실행·PIN 동작). 터널 기반 임시 공유는 더 이상 전제로 두지 않는다.
