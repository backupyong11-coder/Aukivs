# 배포 실행 직전 · 최종 점검 문서

기능 추가 없이 **로컬 확인 → 백엔드 → 프론트 → 재확인** 순서만 담았습니다.  
**백엔드를 먼저**, **프론트를 나중**에 배포합니다.

---

## 복붙용: 전체 배포 순서 (처음부터 끝까지)

아래 번호대로만 진행합니다. 막히면 해당 번호의 상세 절차(뒤쪽 섹션)를 봅니다.

1. **로컬**에서 [로컬 최종 점검 체크리스트](#1-로컬-최종-점검-체크리스트-pin-게이트)를 모두 통과시킨다.  
2. **Git**에 커밋·푸시해 두었다.  
3. **Railway**(또는 Render)에서 `backend` 만 배포하고, [백엔드 환경변수](#4-환경변수-복붙용-목록)를 넣는다.  
4. 백엔드 **공개 HTTPS URL**을 복사한다.  
5. 브라우저로 `https://(백엔드URL)/health` 열어 `status` 가 `ok` 인지 본다.  
6. **Vercel**에서 `frontend` 루트로 프로젝트를 만들고, `OPSPROXY_TARGET` 에 4번 URL을 넣고 [프론트 환경변수](#4-환경변수-복붙용-목록)를 넣은 뒤 **Deploy** 한다.  
7. Vercel **프론트 URL**을 복사한다.  
8. Railway(또는 Render) **Variables**에 `BACKEND_CORS_ORIGINS` = 7번 프론트 URL(끝 `/` 없음)을 넣고 **Redeploy** 한다.  
9. [배포 후 확인할 URL](#5-배포-후-확인할-url)대로 시크릿 창에서 검증한다.  
10. [다른 사람에게 보낼 내용](#6-다른-사람에게-최종적으로-보내는-것)만 전달한다.

---

## 1) 로컬 최종 점검 체크리스트 (PIN 게이트)

**전제:** 터미널에서 백엔드 `127.0.0.1:8001`, 프론트 `localhost:3000` 실행.  
`frontend/.env.local`에 **`DEMO_PIN`** 이 설정되어 있고, 코드 반영 후 **`next dev`를 한 번 재시작**한 상태.

| 순서 | 항목 | 하는 일 | 통과 기준 |
|------|------|---------|-----------|
| 1 | **시크릿 창 첫 접속** | 시크릿/비공개 창에서 `http://localhost:3000` 접속 | `/demo-login` 으로 보내짐 |
| 2 | **틀린 PIN** | 아무 틀린 코드 입력 후 제출 | 오류 메시지, **입장 안 됨** |
| 3 | **맞는 PIN** | `.env.local`의 `DEMO_PIN`과 동일하게 입력 후 입장 | 관제실(홈)으로 이동 |
| 4 | **브리핑** | 홈 화면 | 브리핑 영역이 정상 표시(로딩만 멈추지 않음) |
| 5 | **메모 저장** | 왼쪽 메모 영역에 분류·내용 입력 후 저장 | 저장 안내 또는 시트 반영, 목록 갱신 |
| 6 | **로그아웃** | 사이드바 **데모 로그아웃** | 다시 `/demo-login` 으로 돌아감 |
| 7 | **시크릿 창 재접속** | **새** 시크릿 창에서 `http://localhost:3000` 다시 접속 | 쿠키 없으므로 다시 **PIN 화면** |
| 8 | (선택) **프록시** | 개발자 도구 → Network | 데이터 요청이 `/api/ops/...` (같은 출처) |
| 9 | (선택) **백엔드 직접** | `http://127.0.0.1:8001/health` | JSON에 `"status":"ok"` |

`DEMO_PIN`을 비우면 PIN 항목(1~3, 6~7)은 건너뛰고 4·5·8·9만 확인합니다. **클라우드 배포 시에는 `DEMO_PIN` 넣기를 권장**합니다.

---

## 2) 백엔드 배포 절차 (Railway)

1. [railway.app](https://railway.app) 로그인 → **New Project** → **Deploy from GitHub repo** → 저장소 선택.  
2. 서비스 선택 → **Settings** → **Root Directory** = `backend` 저장.  
3. **Variables** → [§4 백엔드 변수](#4-환경변수-복붙용-목록) 입력 (아직 모르면 `BACKEND_CORS_ORIGINS` 는 잠시 비워 두거나, 나중에 채워도 됨).  
4. **Settings → Deploy** → Start Command 가 비어 있으면:  
   `uvicorn main:app --host 0.0.0.0 --port $PORT`  
   (`backend/Procfile` 이 잡히면 생략될 수 있음.)  
5. **Networking** → **Generate Domain** 등으로 **공개 URL** 생성.  
6. `https://(이주소)/health` 로 확인.  
7. Vercel 프론트 URL이 정해진 뒤 **Variables**에 `BACKEND_CORS_ORIGINS` 추가 → **Redeploy**.

### Render를 쓸 때 (백엔드 대안)

1. [render.com](https://render.com) → **New +** → **Web Service** → 저장소 연결.  
2. **Root Directory**: `backend`  
3. **Build Command**: `pip install -r requirements.txt`  
4. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`  
5. **Health Check Path**: `/health` (권장)  
6. **Environment** 에 Railway와 동일한 변수 입력 → 배포 후 URL로 `/health` 확인.

---

## 3) 프론트엔드 배포 절차 (Vercel)

1. [vercel.com](https://vercel.com) 로그인 → **Add New…** → **Project** → 저장소 **Import**.  
2. **Root Directory** → **Edit** → `frontend` 만 선택.  
3. **Environment Variables** → [§4 프론트 변수](#4-환경변수-복붙용-목록) 입력.  
   - `OPSPROXY_TARGET` = **Railway/Render 백엔드 HTTPS URL** (마지막 `/` 없음).  
4. **Deploy** → 완료 후 **Domains**에 나온 주소가 **프론트 URL**.  
5. 시크릿 창에서 프론트 URL 접속 → PIN → 브리핑·메모까지 확인.  
6. 아직이면 백엔드에 `BACKEND_CORS_ORIGINS` = 이 프론트 URL 넣고 **Redeploy**.

---

## 4) 환경변수 복붙용 목록

값만 본인 것으로 바꿉니다. **키·PIN·JSON은 외부에 노출하지 마세요.**

### Railway / Render (백엔드)

```env
GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/여기시트ID/edit
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...전체JSON한덩어리...}
```

JSON 붙여넣기가 깨지면 Base64만 사용:

```env
GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/여기시트ID/edit
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=여기에Base64문자열
```

탭 이름을 바꾼 경우만:

```env
GOOGLE_CHECKLIST_TAB=체크리스트
GOOGLE_UPLOADS_TAB=업로드운영
GOOGLE_MEMO_TAB=메모장
```

AI 사용 시:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

**Vercel 배포 후** 프론트 주소를 알면 반드시 추가:

```env
BACKEND_CORS_ORIGINS=https://여기-프로젝트.vercel.app
```

프리뷰 도메인까지 한번에 허용(선택):

```env
BACKEND_CORS_ORIGIN_REGEX=https://.*\.vercel\.app
```

### Vercel (프론트)

**Production**에 추가 (이름 그대로):

```env
DEMO_PIN=본인이정한PIN
OPSPROXY_TARGET=https://여기-백엔드.up.railway.app
```

- `NEXT_PUBLIC_API_BASE_URL` 은 **넣지 않음** (비우고 `/api/ops` 프록시만 사용).

---

## 5) 배포 후 확인할 URL

시크릿/비공개 창에서 순서대로 확인합니다.

| # | URL | 기대 |
|---|-----|------|
| 1 | `https://(백엔드)/health` | JSON `"status":"ok"` |
| 2 | `https://(프론트)/` | PIN 화면 또는 로그인 후 홈 |
| 3 | (2)에서 PIN 입력 후 동일 탭 | 관제실·브리핑 표시 |
| 4 | 메모 저장 후 시트 또는 UI | 반영 확인 |
| 5 | 로그아웃 후 **새 시크릿 창**으로 `https://(프론트)/` | 다시 PIN 화면 |

---

## 6) 다른 사람에게 최종적으로 보내는 것

다음 **두 가지만** 보냅니다. 백엔드 URL은 보내지 않아도 됩니다.

| 항목 | 내용 |
|------|------|
| **프론트 URL** | 예: `https://프로젝트명.vercel.app` |
| **PIN** | Vercel에 설정한 `DEMO_PIN` 과 동일 |

**복붙용 안내 문장:**

```text
아래 주소로 접속한 뒤 화면에 나오는 접근 코드에 PIN을 입력하면 됩니다.
URL: https://____________.vercel.app
PIN: ____________  (외부에 올리지 말고 필요한 사람에게만 전달해 주세요.)
```

---

## 더 읽을 곳

- 아키텍처·Google JSON 상세·CORS 설명: [README_DEPLOY.md](./README_DEPLOY.md)  
- 로컬 실행·프록시 개념: [README_DEMO.md](./README_DEMO.md)
