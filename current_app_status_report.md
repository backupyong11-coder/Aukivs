# Current App Status Report

**역할:** 이 저장소의 **구현 완료 범위**, **검증 상태**, **보류 항목**, **Cursor/작업 축 진행 상황**을 한 파일에서 본다.  
**갱신:** 코드베이스 기준 최신 스냅샷(기능 추가 없이 문서만 고칠 때도 이 헤더 아래 §0만 맞추면 된다).

---

## 0. Cursor·진행 상황 스냅샷 (현재까지 완성된 단계)

### 0.1 작업 축별 완료 요약

| 축 | 상태 | 설명 |
|----|------|------|
| **스캐폴딩** | 완료 | FastAPI `backend/`, Next.js App Router `frontend/`, 홈·탭 네비 |
| **Checklist** | 완료 | 조회·생성·수정·완료·삭제 + AI suggest(prioritize/draft) + draft 단건·일괄 시트 반영 |
| **Uploads** | 완료 | 조회·생성·수정·삭제·next-episode + AI suggest + AI 결과→보기/수정/다음회차/삭제 |
| **브리핑** | 완료 | `GET /briefing/today` → 홈 UI |
| **에러 규약** | 완료 | `[설정]` 등 접두 + HTTP 매핑 (`main.py` 라우트별 상이 가능) |
| **테스트(자동)** | 완료 | `backend/tests/` pytest 다수, `frontend` Vitest 일부 |
| **검증 자동화·환경** | 완료 | `scripts/dev-smoke-check.*`, `QUICK_START_VALIDATION.md` (한글·`[]` 경로 대응 안내) |
| **실연결 수동 검증** | **사용자 채움** | [MANUAL_LIVE_VERIFICATION_LOG.md](./MANUAL_LIVE_VERIFICATION_LOG.md) — 실제 Sheets/OpenAI는 로컬에서만 확인 |
| **비서 탭 AI 채팅** | 보류 | `/assistant` 플레이스홀더만 |

### 0.2 이 환경(Cursor/에이전트)에서의 한계 (정확히)

- **사용자 `backend/.env` 비밀 값**에 접근하지 못하는 경우가 많음 → 실제 시트/OpenAI **라이브 호출 검증은 사용자 PC**에서 수행.
- **한글·대괄호 경로**에서 통합 터미널 `cd` 실패가 보고된 적 있음 → `Set-Location -LiteralPath` 또는 `scripts/dev-smoke-check.ps1` 권장 (`QUICK_START_VALIDATION.md` §3).
- **자동 테스트 통과**와 **실제 브라우저·실계정 연결 성공**은 별개 → §3과 `MANUAL_LIVE_VERIFICATION_LOG.md`로 구분해 기록.

### 0.3 관련 문서 (읽는 순서 제안)

| 문서 | 용도 |
|------|------|
| [README.md](./README.md) | 설치·실행·검증 스크립트 요약 |
| [QUICK_START_VALIDATION.md](./QUICK_START_VALIDATION.md) | pytest/npm/빌드 한 번에, UI 스모크 체크리스트 |
| [FULL_HANDOFF_AND_NEXT_STEPS.md](./FULL_HANDOFF_AND_NEXT_STEPS.md) | API 표·인수인계·다음 채팅 붙여넣기 |
| [MANUAL_LIVE_VERIFICATION_LOG.md](./MANUAL_LIVE_VERIFICATION_LOG.md) | 실제 연결 후 수동 검증 표(성공/실패 기록) |

---

## 1. 전체 요약

### 이 앱이 지금 할 수 있는 것

- **Google Sheets** 하나(동일 스프레드시트 URL)에 **체크리스트 탭**·**업로드 탭** 연동(읽기/일부 쓰기).
- **FastAPI:** CRUD·완료·삭제·업로드 전용·AI 제안(시트 비저장)·브리핑.
- **Next.js:** `/` 브리핑+헬스, `/checklist`, `/uploads`, `/settings`, `/assistant`(미연결 안내).
- **OpenAI:** 제안만; 시트 **자동 반영 없음** (사용자 확인 후 기존 API로 저장).

### 핵심 운영 루프

| 루프 | 상태 |
|------|------|
| 체크리스트: 조회 → 완료/수정/삭제/추가 | **완료** (UI+API) |
| 체크리스트: AI → draft 단건/일괄 반영 | **완료** |
| 업로드: 조회 → 생성/수정/삭제/다음 회차 | **완료** |
| 업로드: AI → 카드 연동(보기·수정·다음회차·삭제) | **완료** (자동 반영 없음) |
| 홈 브리핑 | **완료** |
| 비서 대화형 AI | **보류** |

---

## 2. 기능 현황 표

### Checklist

| 기능 | 백엔드 | 프론트 | 비고 |
|------|--------|--------|------|
| read | `GET /checklist` | `/checklist` | D=`완료` 제외 |
| create | `POST /checklist/create` | 모달/폼 | |
| update | `POST /checklist/update` | 수정 UI | B·C |
| complete | `POST /checklist/complete` | 완료 | D 완료 |
| delete | `POST /checklist/delete` | 삭제 | 행 삭제 |
| AI suggest | `POST /ai/checklist/suggest` | prioritize / draft | 시트 미저장 |
| draft 단건·일괄 | `POST /checklist/create` | `ChecklistClient` | |

**주요 경로:** `backend/main.py`, `backend/services/google_checklist_sheets.py`, `backend/services/ai_checklist_suggest.py`, `frontend/src/components/ChecklistClient.tsx`, `frontend/src/lib/checklist.ts`, `frontend/src/lib/draftSuggestItem.ts`

### Uploads

| 기능 | 백엔드 | 프론트 | 비고 |
|------|--------|--------|------|
| read | `GET /uploads` | `/uploads` | A2:F; C·D 비면 조회 `[파싱]` |
| create | `POST /uploads/create` | 새 업로드 추가 | 서버 UUID |
| update | `POST /uploads/update` | 수정 | D·E·F |
| delete | `POST /uploads/delete` | 카드·AI | 행 삭제 |
| next-episode | `POST /uploads/next-episode` | 카드·AI | `[유효하지않은상태]` 가능 |
| AI suggest | `POST /ai/uploads/suggest` | prioritize / review | 시트 미저장 |
| AI → 카드 UX | — | 보기·수정·다음회차·삭제 | `uploadsAiJump.ts` 등 |

**주요 경로:** `backend/services/google_uploads_sheets.py`, `backend/services/ai_uploads_suggest.py`, `frontend/src/components/UploadsClient.tsx`, `frontend/src/lib/uploads.ts`, `frontend/src/lib/uploadsAiJump.ts`

### 기타

| API | 프론트 |
|-----|--------|
| `GET /health` | 홈 |
| `GET /briefing/today` | 홈 `BriefingTodayClient` |

---

## 3. 테스트 / 검증 현황

**상세:** [QUICK_START_VALIDATION.md](./QUICK_START_VALIDATION.md)

| 구분 | 명령 / 산출물 |
|------|----------------|
| 일괄 스크립트 | `scripts/dev-smoke-check.ps1` · `.bat` · `.sh` |
| Backend | `backend`에서 `python -m pytest -q` |
| Frontend | `npm test`, `npm run build` |
| 실제 연결 | [MANUAL_LIVE_VERIFICATION_LOG.md](./MANUAL_LIVE_VERIFICATION_LOG.md) (사용자 기록) |

- **pytest:** 에이전트 환경에서 전체 통과 이력 있음; 로컬·한글 경로는 별도 확인.
- **PowerShell `[]`:** `Set-Location -LiteralPath` — §3 참고.

---

## 4. 에러 처리 원칙 (detail 접두 ↔ HTTP)

라우트별 상이할 수 있음 → 최종은 `backend/main.py` 해당 핸들러.

| 접두 | 의미(대략) | HTTP(참고) |
|------|------------|------------|
| `[설정]` | env·파일·URL·키 | 503 |
| `[공유]`·`[Sheets API]` | 권한·API 오류 | 502 등 |
| `[파싱]` | 본문·시트·모델 JSON | 400 또는 502 |
| `[찾을수없음]` | id·탭 | 404 |
| `[유효하지않은상태]` | next-episode 불가 | 400 |
| `[AI API]` | OpenAI | 502 |
| `[브리핑]` | 브리핑 전용 | 503/502 |

---

## 5. 실제 운영 플로우 (요약)

- **Checklist:** 시트와 앱에서 목록 관리; AI는 참고 후 필요 시 생성/일괄 추가로 시트 반영.
- **Uploads:** A~F 유지; AI는 참고 후 카드 또는 AI 행 액션으로만 반영(확인 필수).

---

## 6. 남은 작업

### 권장(필수에 가까움)

- [ ] 로컬에서 `dev-smoke-check` 또는 동등 명령으로 **자동 검증 1회** 후 결과 메모.
- [ ] [MANUAL_LIVE_VERIFICATION_LOG.md](./MANUAL_LIVE_VERIFICATION_LOG.md) **실연결 표 채우기**.

### 선택

- E2E, CI, `/assistant` 실구현, 배치 API, 업로드 AI 자동 반영(정책 변경 시) 등.

---

## 7. 보류 / 하지 않은 것

- AI 결과 **자동** 시트 반영(의도적 비구현).
- 업로드 AI **일괄** next-episode / delete.
- `/assistant` 실시간 대화 연동.

---

*인수인계 요약은 [FULL_HANDOFF_AND_NEXT_STEPS.md](./FULL_HANDOFF_AND_NEXT_STEPS.md)와 함께 본다.*
