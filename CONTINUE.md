# PC 이전 — 5분 요약

> **전체:** [PC_이전_가이드.md](./PC_이전_가이드.md) · **Cursor:** [CURSOR_시작프롬프트.md](./CURSOR_시작프롬프트.md)

## 1. 코드

```powershell
git clone https://github.com/backupyong11-coder/Aukivs.git
cd Aukivs
powershell -ExecutionPolicy Bypass -File .\scripts\setup-new-pc.ps1
```

## 2. 옛 PC에서 복사 (Git 없음)

- `backend/.env` · `frontend/.env.local` · (선택) Google JSON · `secrets/PC이전_복사체크리스트.txt` 참고

## 3. 실행

```powershell
# T1
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001

# T2
cd frontend
npm run dev
```

→ http://localhost:3000

## 4. 운영 배포

| 대상 | 방법 |
|------|------|
| 프론트 | `git push` → Vercel 자동 |
| **백엔드** | `cd backend; flyctl deploy --app backend-patient-wave-707` |

## 5. Cursor

새 채팅 → `CURSOR_시작프롬프트.md` 붙여넣기

## 최근 (2026-05)

- 업무담당(`work_assignee`) · 인물별 대시보드 · 지속진행 보류 탭
- Fly 미배포 시 업무정리 400 → `flyctl deploy` 필수
