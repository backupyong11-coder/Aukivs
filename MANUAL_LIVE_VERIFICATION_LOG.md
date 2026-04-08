# 실제 연결 수동 검증 로그

**용도:** 실제 Google Sheets + OpenAI 연결 후 `/checklist`, `/uploads`를 브라우저에서 검증한 **결과만** 기록한다.  
**자동화 에이전트 한계:** 원격/CI 환경에서는 사용자의 `backend/.env` 비밀 값과 브라우저 조작에 접근할 수 없으므로, **아래 표는 사용자가 직접 채운다.**

---

## 0. 실행 전 설정 점검 (체크만)

### Backend (`backend/.env`)

| 항목 | 확인 |
|------|------|
| `GOOGLE_SERVICE_ACCOUNT_FILE` | JSON 파일 경로가 실제 존재하는가 (절대 경로 권장) |
| `GOOGLE_SHEET_URL` | 브라우저에서 연 스프레드시트 **전체 URL** 과 일치하는가 |
| `GOOGLE_CHECKLIST_TAB` | 시트 탭 이름과 일치 (기본 `체크리스트`) |
| `GOOGLE_UPLOADS_TAB` | 시트 탭 이름과 일치 (기본 `업로드운영`) |
| 스프레드시트 공유 | 서비스 계정 `client_email` 에 **편집자** 이상 (쓰기 API 사용 시) |
| `OPENAI_API_KEY` | AI 제안 테스트 시 설정 (미사용이면 생략 가능) |
| (선택) `OPENAI_MODEL`, `OPENAI_TIMEOUT_SEC` | |

### Frontend (`frontend/.env.local`)

| 항목 | 확인 |
|------|------|
| `NEXT_PUBLIC_API_BASE_URL` | 백엔드와 동일 호스트/포트 (예: `http://localhost:8000`) |
| dev 서버 재시작 | `.env.local` 수정 후 `npm run dev` 재실행 |

### 서버 기동

1. `backend`: `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`
2. `frontend`: `npm run dev`
3. `http://localhost:3000/health` 또는 홈의 Backend 헬스 위젯으로 연결 확인

---

## 1. `/checklist` 수동 검증

| # | 동작 | 성공/실패 | 비고(에러 메시지·스크린 등) |
|---|------|-----------|------------------------------|
| 1 | 페이지 로드·목록 조회 | | |
| 2 | 새 항목 생성 | | |
| 3 | 항목 수정 | | |
| 4 | 완료 처리 | | |
| 5 | 삭제 | | |
| 6 | AI 제안 — prioritize | | |
| 7 | AI 제안 — draft | | |
| 8 | draft 항목 개별 시트 반영 | | |
| 9 | draft 선택 일괄 추가 | | |

---

## 2. `/uploads` 수동 검증

| # | 동작 | 성공/실패 | 비고 |
|---|------|-----------|------|
| 1 | 페이지 로드·목록 조회 | | |
| 2 | 새 업로드 추가 | | |
| 3 | 카드 수정 | | |
| 4 | 다음 회차 | | |
| 5 | 카드 삭제 | | |
| 6 | AI 추천 — prioritize | | |
| 7 | AI 추천 — review | | |
| 8 | AI 행 → 해당 항목 보기 | | |
| 9 | AI 행 → 수정 열기 | | |
| 10 | AI 행 → 다음 회차 (confirm) | | |
| 11 | AI 행 → 삭제 (confirm) | | |

---

## 3. 요약 (검증 실시한 날짜: ________)

- **성공한 범위:**
- **실패·이슈 (재현 방법):**
- **코드/설정 수정 여부:** (있으면 커밋/파일명)

---

## 4. 이 저장소 스냅샷에서의 자동 확인 (참고)

| 항목 | 결과 |
|------|------|
| `frontend/.env.local` 존재 및 `NEXT_PUBLIC_API_BASE_URL` | 확인됨: `http://localhost:8000` |
| `backend/.env` | 워크스페이스에 포함되지 않음(일반적으로 로컬 전용) — 사용자 PC에서만 점검 |
| 실제 Sheets/OpenAI 호출 | **이 환경에서는 미실행** |

추가 검증 절차는 [QUICK_START_VALIDATION.md](./QUICK_START_VALIDATION.md) §5 와 동일 계열이다.
