# Quick Start — 검증 (5분 안에 시작)

새 작업자·새 채팅이 **자동 검증 + 스모크 절차**를 바로 잡을 때 쓰는 문서입니다.

---

## 0. 사전 준비 (한 번만)

| 항목 | 위치 | 내용 |
|------|------|------|
| Python | 시스템 | 3.11+ 권장, `python` 이 PATH에 있어야 함 |
| Node.js | 시스템 | 20+ 권장, `npm` 사용 가능 |
| 백엔드 의존성 | `backend/` | `python -m pip install -r requirements-dev.txt` (테스트 포함) |
| 프론트 의존성 | `frontend/` | `npm install` |
| 백엔드 환경 | `backend/.env` | `backend/.env.example` 참고 (pytest는 대부분 mock이라 비워도 통과하는 경우 많음) |
| 프론트 API URL | `frontend/.env.local` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` |

---

## 1. 한 번에 돌리기 (자동)

저장소 **루트**에서 실행합니다. 스크립트는 `scripts/` 기준으로 **상위 폴더 = 루트**로 이동합니다.

### Windows — PowerShell (권장: `-LiteralPath` 사용하는 스크립트)

```powershell
# 저장소 루트에서 (경로는 본인 환경에 맞게)
Set-Location -LiteralPath 'C:\경로\WorkSheet'
pwsh -ExecutionPolicy Bypass -File .\scripts\dev-smoke-check.ps1
```

Windows PowerShell 5.1만 있으면:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-smoke-check.ps1
```

### Windows — CMD

```cmd
cd /d C:\경로\WorkSheet
scripts\dev-smoke-check.bat
```

### Git Bash / WSL / macOS / Linux

```bash
cd /path/to/WorkSheet
chmod +x scripts/dev-smoke-check.sh   # 최초 1회
./scripts/dev-smoke-check.sh
```

**실행 순서:** `backend`에서 `python -m pytest -q` → `frontend`에서 `npm test` → `npm run build`.

---

## 2. 수동으로 단계별 (복붙)

### Backend — 전체 테스트

```powershell
Set-Location -LiteralPath '<저장소루트>\backend'
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

### Backend — 특정 파일만

```powershell
Set-Location -LiteralPath '<저장소루트>\backend'
python -m pytest tests/test_uploads_create.py -q
```

### Frontend

```powershell
Set-Location -LiteralPath '<저장소루트>\frontend'
npm install
npm test
npm run build
```

### Dev 서버 (브라우저 스모크용)

터미널 1:

```powershell
Set-Location -LiteralPath '<저장소루트>\backend'
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

터미널 2:

```powershell
Set-Location -LiteralPath '<저장소루트>\frontend'
npm run dev
```

브라우저: `http://localhost:3000`  
API 직접: `http://localhost:8000/health`

---

## 3. Windows + 한글 경로 + PowerShell 이슈 (정확히)

### 어떤 상황에서 깨지나

1. **경로에 `[`, `]` 포함**  
   - 예: `a:\프로그램\[WorkSheet]`  
   - PowerShell에서 `[]`는 **와일드카드(문자 클래스)** 로 해석됩니다.  
   - `Set-Location "...\[WorkSheet]"` 가 **실제 폴더를 못 찾고** 다른 경로로 가거나 실패할 수 있습니다.

2. **한글 경로 인코딩**  
   - Cursor/IDE가 생성한 래퍼 스크립트가 경로를 **잘못된 코드 페이지**로 넘기면 `Set-Location` 이 깨진 문자열로 실행되어 **경로를 찾을 수 없음**이 납니다.

3. **`cd` + `&&`**  
   - Windows PowerShell 5.1에서는 `&&`가 **없거나** 버전에 따라 동작이 다릅니다. `;` 또는 줄 나눔을 쓰세요.

### 우회 방법 (실무 순)

| 방법 | 설명 |
|------|------|
| **`-LiteralPath`** | `Set-Location -LiteralPath 'D:\full\path\to\[WorkSheet]'` 처럼 **리터럴 경로**로 이동. |
| **탐색기에서 연 터미널** | 폴더에서 주소창에 `powershell` 입력 → 현재 폴더가 이미 루트라 `cd` 생략 가능. |
| **짧은 영문 경로** | `C:\dev\WorkSheet` 에 클론/복제하거나 `mklink /J` 로 정션. |
| **`subst`** | `subst W: "D:\long\path\[WorkSheet]"` 후 `W:` 로 작업. |
| **CMD** | `cd /d "D:\path\[WorkSheet]"` — 배치·cmd는 대괄호를 와일드카드로 안 씀. |
| **Git Bash** | POSIX 경로로 `cd` 할 때 인코딩 이슈가 적은 경우가 많음. |

### 이 저장소 예시 (가상 경로)

PowerShell에서 루트로 가기:

```powershell
Set-Location -LiteralPath 'a:\프로그램\[WorkSheet]'
```

절대 경로로 pytest만:

```powershell
Set-Location -LiteralPath 'a:\프로그램\[WorkSheet]\backend'
python -m pytest -q
```

---

## 4. 검증 결과를 어떻게 기록하나

| 구분 | 의미 |
|------|------|
| **이 환경에서 자동 실행 안 됨** | IDE 통합 터미널·원격 에이전트가 `cd` 실패 등으로 스크립트 미실행. |
| **로컬에서 확인 완료** | 본인 PC에서 `dev-smoke-check` 또는 §2 수동 명령 성공. |

이슈/PR/메모에 날짜와 함께 적어 두면 이후 스프린트에서 혼선이 줄어듭니다.

---

## 5. 최소 UI 스모크 체크리스트 (수동)

**전제:** §2 Dev 서버 기동, `frontend/.env.local` 설정, 시트·키는 실제 연동 테스트 시만 필요.

### `/checklist` (`ChecklistClient`)

- [ ] **조회** — 페이지 열면 목록 또는 빈 상태/에러가 일관되게 표시됨  
- [ ] **생성** — 상단 흐름에서 새 항목 추가 후 목록에 반영  
- [ ] **수정** — 카드「수정」→ 저장 후 반영  
- [ ] **완료** —「완료」후 목록에서 사라짐(시트 D열 규칙)  
- [ ] **삭제** —「삭제」confirm 후 반영  
- [ ] **AI 제안** — 모드 선택 후「추천 받기」, 결과 표시  
- [ ] **draft 개별 추가** — draft 모드에서 항목별「시트에 추가」류 버튼  
- [ ] **draft 선택 일괄 추가** — 체크 후「선택한 항목 추가」  

### `/uploads` (`UploadsClient`)

- [ ] **조회** — 목록/빈 상태/에러  
- [ ] **생성** —「새 업로드 추가」→ 저장 → 재조회 반영  
- [ ] **수정** — 카드「수정」→ 저장  
- [ ] **삭제** — 카드「삭제」confirm  
- [ ] **다음 회차** — 카드「다음 회차」confirm  
- [ ] **AI 추천** — 모드·추가 요청 후「추천 받기」  
- [ ] **AI → 해당 항목 보기** — 스크롤·하이라이트  
- [ ] **AI → 수정 열기** — 모달 열림  
- [ ] **AI → 다음 회차** — confirm 후 처리·재조회  
- [ ] **AI → 삭제** — confirm 후 목록에서 빠지고 AI 행에「목록 없음」표시  

### 홈 `/`

- [ ] 브리핑 영역 로드(시트 미설정 시 에러 메시지일 수 있음)  
- [ ] `/health` 위젯  

---

## 6. 관련 문서

- [README.md](./README.md) — 설치·실행 요약  
- [current_app_status_report.md](./current_app_status_report.md) — 기능·에러 원칙  
- [FULL_HANDOFF_AND_NEXT_STEPS.md](./FULL_HANDOFF_AND_NEXT_STEPS.md) — API·인수인계  

---

**가장 먼저 할 일:** §1 스크립트 한 번 실행 → 실패 시 §3 경로 우회 후 §2 수동 명령.
