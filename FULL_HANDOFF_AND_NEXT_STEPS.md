# Full Handoff & Next Steps

다음 작업자/다음 채팅이 **바로 이어받기** 위한 최종 인수인계 문서이다.

---

## A. 프로젝트 한 줄

**개인용 운영 비서:** Google Sheets(체크리스트·업로드) + FastAPI + Next.js. OpenAI는 **제안만** 하고, 시트 반영은 **사용자가 UI/API로 실행**.

---

## B. 디렉터리 & 진입점

| 영역 | 경로 | 실행 |
|------|------|------|
| 백엔드 | `backend/main.py` | `cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000` |
| 프론트 | `frontend/` | `cd frontend && npm run dev` (`.env.local`에 `NEXT_PUBLIC_API_BASE_URL`) |
| 환경 예시 | `backend/.env.example`, `frontend/.env.example` | |

### B-1. 검증 자동화 (이 스프린트)

| 산출물 | 설명 |
|--------|------|
| [QUICK_START_VALIDATION.md](./QUICK_START_VALIDATION.md) | 5분 검증 가이드: 스크립트·수동 명령·Windows 경로·UI 스모크 표 |
| `scripts/dev-smoke-check.ps1` | PowerShell — `Set-Location -LiteralPath` 로 한글·`[]` 경로 완화 |
| `scripts/dev-smoke-check.bat` | CMD — `cd /d` 기반 |
| `scripts/dev-smoke-check.sh` | Git Bash / Unix |

루트에서 예: `pwsh -ExecutionPolicy Bypass -File .\scripts\dev-smoke-check.ps1`

---

## C. API 루트 목록 (요약)

| Method | Path | 용도 |
|--------|------|------|
| GET | `/health` | 헬스체크 |
| GET | `/checklist` | 활성 체크리스트 |
| POST | `/checklist/create` | 행 추가 |
| POST | `/checklist/update` | B·C 수정 |
| POST | `/checklist/complete` | D 완료 |
| POST | `/checklist/delete` | 행 삭제 |
| POST | `/ai/checklist/suggest` | AI 제안 (prioritize/draft) |
| GET | `/uploads` | 업로드 목록 |
| POST | `/uploads/create` | 행 append |
| POST | `/uploads/update` | D·E·F 패치 |
| POST | `/uploads/delete` | 행 삭제 |
| POST | `/uploads/next-episode` | 상태·시각 1단계 전진 |
| POST | `/ai/uploads/suggest` | AI 제안 (prioritize/review) |
| GET | `/briefing/today` | 오늘 브리핑 JSON |

CORS: 로컬 `localhost:3000` 등 ( `main.py` 참고).

---

## D. 프론트 라우트

| 경로 | 컴포넌트(대표) | 내용 |
|------|----------------|------|
| `/` | `BriefingTodayClient`, `BackendHealth` | 브리핑 + 헬스 |
| `/checklist` | `ChecklistClient` | 전체 CRUD + AI |
| `/uploads` | `UploadsClient` | 전체 CRUD + AI 연동 버튼 |
| `/settings` | (설정 UI) | |
| `/assistant` | 플레이스홀더 | “아직 연결 안 함” |

---

## E. 체크리스트 — 구현 완료 (코드 기준)

- [x] read / create / update / complete / delete  
- [x] AI suggest (prioritize, draft)  
- [x] draft 단건 시트 반영 (`/checklist/create`)  
- [x] draft 선택 일괄 반영 (프론트 루프 + 동일 API)  

---

## F. 업로드 — 구현 완료 (코드 기준)

- [x] read / create / update / delete / next-episode  
- [x] AI suggest (prioritize, review), 시트 미저장  
- [x] AI 결과 → 카드로 보기 (스크롤·하이라이트)  
- [x] AI 결과 → 수정 모달 열기  
- [x] AI 결과 → 다음 회차 (confirm → API → 재조회·스크롤)  
- [x] AI 결과 → 삭제 (confirm → API → 재조회, 목록 반영)  

---

## G. 테스트·검증 상태

| 항목 | 상태 | 메모 |
|------|------|------|
| Backend pytest 전체 | **에이전트에서 통과 이력 있음 / 로컬은 별도 확인** | `scripts/dev-smoke-check.*` 또는 `backend`에서 `python -m pytest -q` |
| Frontend vitest | 동일 | `npm test` |
| Frontend build | 동일 | `npm run build` |
| 한글·`[]` 경로 | **PowerShell에서 재현 가능** | `[]`는 와일드카드 → `-LiteralPath` 또는 CMD/짧은 경로 — **QUICK_START_VALIDATION.md §3** |
| IDE 통합 터미널 | **이 환경에서 cd 실패 보고 사례 있음** | ≠ 로컬 검증 실패; 탐색기 터미널·스크립트 사용 |

**우선 실행 권장 (3줄):**  
1) `QUICK_START_VALIDATION.md` 열기  
2) 루트에서 `dev-smoke-check` 스크립트 1회  
3) §5 UI 스모크 체크리스트 표시

---

## H. 에러 접두 빠른 참조

작업자는 API `detail` 문자열 **접두사**로 원인 구간을 나눈다: `[설정]` `[공유]` `[Sheets API]` `[파싱]` `[찾을수없음]` `[유효하지않은상태]` `[AI API]` `[브리핑]`. HTTP 코드는 엔드포인트별로 `main.py`에 명시.

---

## I. 남은 작업 — 필수 vs 선택

**필수 (마감 품질)**

1. 로컬에서 `scripts/dev-smoke-check.*` 또는 동등한 세 명령(pytest / npm test / build)으로 결과를 이슈·메모에 남기기 — 절차는 `QUICK_START_VALIDATION.md`.  
2. 시트 열 설명 등 문서 정합성은 `README.md` · `current_app_status_report.md` 를 주기적으로 맞추기.

**선택**

- E2E, CI, 업로드 AI 고도화, 자동 반영, 배치 API, `/assistant` 실구현 등.

---

## J. 다음 작업 추천 순서 (1~2단계)

1. **로컬 검증 고정**  
   - 이유: 경로 이슈로 자동화가 불안정할 수 있어, “통과했다”는 근거를 사람이 한 번 남기는 것이 이후 리팩터 안전망이 됨.  
2. **문서·README 동기화**  
   - 이유: 업로드 탭은 A~F·status 열까지 확장되었고, 루트 README 일부는 옛 A~E 설명이 남아 있을 수 있음.  

그 다음에야 기능 추가(비서 탭, 배치 등)를 권장한다.

---

## K. 다음 채팅 첫 메시지 예시 (붙여넣기용)

아래를 복사해 새 대화 첫 메시지로 쓰면 컨텍스트가 빠르게 맞는다.

```
프로젝트 루트: [WorkSheet]
인수인계 문서: QUICK_START_VALIDATION.md, current_app_status_report.md, FULL_HANDOFF_AND_NEXT_STEPS.md 를 읽고 이어서 작업한다.
검증: scripts/dev-smoke-check.ps1(또는 .bat/.sh) 로 pytest + npm test + build 를 먼저 돌린다.
직전까지: checklist/uploads CRUD + AI 제안(비자동 반영) + uploads AI→카드 연동 완료.
다음 목표: (여기에 적기)
```

---

*상세 표와 운영 플로우는 `current_app_status_report.md` §1~§5를 본다.*
