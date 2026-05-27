# WorkSheet — 새 PC 초기 셋업 (Windows PowerShell)
# 사용: 저장소 루트에서
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-new-pc.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "== WorkSheet setup ==" -ForegroundColor Cyan
Write-Host "Root: $Root"

function Test-Cmd($name, $args) {
    try {
        $null = & $name @args 2>$null
        return $true
    } catch {
        return $false
    }
}

$missing = @()
if (-not (Test-Cmd "git" @("--version"))) { $missing += "Git" }
if (-not (Test-Cmd "node" @("-v"))) { $missing += "Node.js" }
if (-not (Test-Cmd "python" @("--version"))) { $missing += "Python" }
if ($missing.Count -gt 0) {
    Write-Host "설치 필요: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "Git / Node / Python OK" -ForegroundColor Green

# Python deps
Write-Host "`n== backend Python packages ==" -ForegroundColor Cyan
Set-Location (Join-Path $Root "backend")
python -m pip install -r requirements-dev.txt

# Frontend deps
Write-Host "`n== frontend npm install ==" -ForegroundColor Cyan
Set-Location (Join-Path $Root "frontend")
npm install

Set-Location $Root

# Env files
Write-Host "`n== environment files ==" -ForegroundColor Cyan
$beEnv = Join-Path $Root "backend\.env"
$feEnv = Join-Path $Root "frontend\.env.local"
$warn = $false
if (-not (Test-Path $beEnv)) {
    Write-Host "[!] backend/.env 없음 — .env.example 참고해 옛 PC에서 복사하세요." -ForegroundColor Yellow
    $warn = $true
} else {
    Write-Host "[OK] backend/.env" -ForegroundColor Green
}
if (-not (Test-Path $feEnv)) {
    Write-Host "[!] frontend/.env.local 없음 — .env.example 참고해 복사하세요." -ForegroundColor Yellow
    $warn = $true
} else {
    Write-Host "[OK] frontend/.env.local" -ForegroundColor Green
}

Write-Host "`n== 다음 단계 ==" -ForegroundColor Cyan
Write-Host @"
1. backend/.env, frontend/.env.local 이 없으면 PC_이전_가이드.md §1-2 참고
2. 터미널1: cd backend; python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
3. 터미널2: cd frontend; npm run dev
4. http://localhost:3000
5. Cursor: CURSOR_시작프롬프트.md
"@

if (-not $warn) {
    Write-Host "`n로컬 API 확인 (백엔드 실행 중일 때만):" -ForegroundColor DarkGray
    Write-Host "  curl http://127.0.0.1:8001/health"
}

Write-Host "`nDone." -ForegroundColor Green
