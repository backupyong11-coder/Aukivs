# FastAPI — 프로젝트 표준 포트 8001
Set-Location -LiteralPath $PSScriptRoot
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
