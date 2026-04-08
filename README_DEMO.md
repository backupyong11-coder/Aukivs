# 데모 시스템 실행·외부 공개 가이드

프로젝트는 **Next.js 프론트**와 **FastAPI 백엔드**로 나뉘어 있으며, 데모에서는 **방문자에게 프론트 HTTPS URL 하나와 공용 PIN**만 알려 주면 됩니다. 정식 회원·개별 계정은 없고, **공용 PIN**으로만 앱과 API 프록시에 진입합니다.

---

## Cursor에서 어떤 폴더를 열까?

**저장소 루트** `A:\프로그램\[WorkSheet]` 를 연다.

- `frontend/`·`backend/`·`scripts/`·문서가 한 워크스페이스에 있어야 프록시·환경 변수·호출 경로를 일관되게 수정할 수 있습니다.
- 하위 폴더만 열면 Next rewrite·미들웨어·백엔드 포트를 동시에 보기 어렵습니다.

---

## 호출 구조(한 줄 요약)

| 구분 | 역할 |
|------|------|
| 브라우저 | 같은 출처로만 요청: 페이지·`/api/ops/*`·`/api/demo-auth/*` |
| Next `rewrites` | `/api/ops/:path*` → `OPSPROXY_TARGET`(기본 `http://127.0.0.1:8001`)의 `/:path*` |
| FastAPI | 메모·브리핑·체크리스트·업로드·AI 제안 등 **모든** REST 엔드포인트 |

프론트 코드는 `getApiBaseUrl()`(`frontend/src/lib/apiBase.ts`) 하나로 베이스를 정합니다.

- **`NEXT_PUBLIC_API_BASE_URL` 을 비운 상태(권장)**  
  클라이언트: `https://(또는 http://)호스트/api/ops`  
  서버(SSR): `http://127.0.0.1:PORT/api/ops`
- 값을 넣으면 브라우저가 **백엔드에 직접** 붙습니다. CORS·노출 범위가 커지므로 **Vercel 등 클라우드 배포 시에도 비우는 것**을 권장합니다.

---

## 환경 변수

### `frontend/.env.local` (직접 생성)

```env
# 데모 게이트: 값이 있으면 PIN 입력 후에만 앱·/api/ops 접근
DEMO_PIN=여기에_공용_PIN

# 백엔드 주소 — 포트 8001 고정에 맞춤
OPSPROXY_TARGET=http://127.0.0.1:8001

# 데모에서는 비워 두기 권장 (위 프록시만 사용)
# NEXT_PUBLIC_API_BASE_URL=
```

### `backend/.env`

기존과 동일(Google Sheets, OpenAI 등). 데모 PIN은 **프론트**에서만 검사합니다.

**상시 외부 접속(내 PC 끄기)** 은 Vercel + Railway/Render 배포로 합니다 → **[README_DEPLOY.md](./README_DEPLOY.md)**.

---

## 백엔드 실행 (포트 8001)

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

확인: 브라우저 또는 `curl` 로 `http://127.0.0.1:8001/health` → `{"status":"ok", ...}`

---

## 프론트 실행

```bash
cd frontend
npm install
npm run dev
```

기본: `http://localhost:3000`  
`DEMO_PIN` 이 설정되어 있으면 첫 접속 시 `/demo-login` 으로 보내고, PIN이 맞아야 합니다.

---

## PIN 게이트 동작

- `DEMO_PIN` 이 비어 있으면: 게이트 없음(로컬 개발 편의).
- 값이 있으면:
  - **Proxy**(`frontend/src/proxy.ts`, Next.js 16): 쿠키 `demo_auth=ok` 없으면 보호된 경로는 `/demo-login?next=…` 로 리다이렉트, `/api/ops` 는 401 JSON.
  - **로그인** `POST /api/demo-auth/login`: PIN 일치 시 `httpOnly` 쿠키(7일, `SameSite=Lax`).
  - **로그아웃** `POST /api/demo-auth/logout`: 쿠키 삭제 후 `/demo-login` 으로 이동(사이드바 **데모 로그아웃**).

이 PIN은 **간단한 데모용**이며, 실서비스 수준의 인증·감사로 보지 마세요.

---

## 권장 실행 순서

1. `backend/.env` 준비  
2. 터미널 1: `backend` 에서 uvicorn **8001**  
3. `frontend/.env.local` 에 `DEMO_PIN`, `OPSPROXY_TARGET` 설정  
4. 터미널 2: `frontend` 에서 `npm run dev`  
5. 브라우저에서 로컬 또는 터널 URL 접속 → PIN 입력 → 사용  
6. 인터넷에 상시 공개: **[README_DEPLOY.md](./README_DEPLOY.md)** (Vercel + Railway/Render).

---

## 관련 파일

| 파일 | 설명 |
|------|------|
| `frontend/next.config.ts` | `/api/ops` → `OPSPROXY_TARGET` (기본 8001) |
| `frontend/src/lib/apiBase.ts` | API 베이스 URL 단일 정의 |
| `frontend/src/proxy.ts` | 데모 PIN 게이트 |
| `frontend/src/app/api/demo-auth/*` | 로그인·로그아웃 |
| `frontend/src/app/demo-login/*` | PIN 화면 |
| `backend/main.py` | FastAPI 앱 |

클라우드 배포 절차·환경 변수 전체 목록은 [README_DEPLOY.md](./README_DEPLOY.md) 를 본다.
