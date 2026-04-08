#!/usr/bin/env bash
# 저장소 루트 = 이 스크립트의 상위 디렉터리
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo "Repository root: $ROOT"

echo ""
echo "== [1/3] Backend: python -m pytest -q =="
cd "$BACKEND"
python -m pytest -q

echo ""
echo "== [2/3] Frontend: npm test =="
cd "$FRONTEND"
npm test

echo ""
echo "== [3/3] Frontend: npm run build =="
npm run build

echo ""
echo "All automated checks finished successfully."
