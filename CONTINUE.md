# B PC에서 5분 안에 이어하기

> 상세는 [HANDOVER.md](./HANDOVER.md) **§0** 참고.

## 1. 코드 받기

```powershell
git clone https://github.com/backupyong11-coder/Aukivs.git
cd Aukivs
git pull origin master
```

## 2. 환경 파일 (Git에 없음 — A에서 복사)

| 파일 | 위치 |
|------|------|
| `backend/.env` | `DATA_BACKEND`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `frontend/.env.local` | `DEMO_PIN`, `OPSPROXY_TARGET=http://127.0.0.1:8001` |

## 3. 실행

```powershell
# 터미널 1
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001

# 터미널 2
cd frontend
npm install
npm run dev
```

→ http://localhost:3000

## 4. Cursor

- 같은 계정 로그인
- **새 채팅**에서: `HANDOVER.md §0 읽고 이어서 …`

## 5. 안 넘어오는 것

채팅 기록 · localStorage(열 순서/태그) · 미 push 커밋

## 최근 작업 요약

7개 정리 페이지: 인라인 수정, 되돌리기, 열 드래그, `FilterTagsFlow` 태그 필터.  
최신 커밋: `git log -3 --oneline`
