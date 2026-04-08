#Requires -Version 5.1
<#
.SYNOPSIS
  저장소 루트 기준으로 backend pytest → frontend npm test → npm run build 를 순서대로 실행합니다.

.DESCRIPTION
  - 스크립트 위치(scripts/)에서 상위 폴더를 저장소 루트로 간주합니다.
  - 경로에 한글·대괄호가 있어도 Set-Location -LiteralPath 로 이동합니다 ([] 는 PowerShell 와일드카드이므로 -LiteralPath 필수).

.EXAMPLE
  # 저장소 루트에서
  pwsh -File .\scripts\dev-smoke-check.ps1

  # 또는 scripts 폴더에서
  cd scripts
  .\dev-smoke-check.ps1
#>

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$RepoRoot = Split-Path -LiteralPath $ScriptDir -Parent
$Backend = Join-Path $RepoRoot "backend"
$Frontend = Join-Path $RepoRoot "frontend"

function Assert-PathExists([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Error "$Label not found: $Path"
    }
}

Assert-PathExists $Backend "backend folder"
Assert-PathExists $Frontend "frontend folder"

Write-Host "Repository root: $RepoRoot" -ForegroundColor DarkGray

Write-Host "`n== [1/3] Backend: python -m pytest -q ==" -ForegroundColor Cyan
Set-Location -LiteralPath $Backend
python -m pytest -q
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "`n== [2/3] Frontend: npm test ==" -ForegroundColor Cyan
Set-Location -LiteralPath $Frontend
npm test
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "`n== [3/3] Frontend: npm run build ==" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "`nAll automated checks finished successfully." -ForegroundColor Green
exit 0
