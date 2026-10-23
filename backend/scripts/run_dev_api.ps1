# 로컬 개발용 API 서버 실행(개발 DB + local 인증). 운영에서 쓰지 않는다.
# 사용: backend/ 에서  .\scripts\run_dev_api.ps1 [-Port 8000]
# DATABASE_URL이 이미 설정되어 있으면 그 값을, 없으면 로컬 compose 개발 DB를 쓴다.
# 실행 전 확인: WSL에서 postgres 컨테이너가 떠 있고(docker compose up -d postgres), migration이 적용되어 있어야 한다.
param([int]$Port = 8000)

$backend = Split-Path -Parent $PSScriptRoot
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/simulation_platform"
}
$env:AUTH_MODE = "local"
$env:APP_ENV = "development"
$python = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "가상환경이 없습니다: $python (backend/README.md의 설치 절차를 먼저 수행하세요)" }

$target = [System.Uri]($env:DATABASE_URL -replace '^postgresql\+psycopg', 'postgresql')
Write-Host "API 서버: http://127.0.0.1:$Port  (DB: $($target.Host):$($target.Port)$($target.AbsolutePath), 인증: local X-Debug-User)"
Set-Location $backend
& $python -m uvicorn simulation_platform.api.app:app --port $Port
