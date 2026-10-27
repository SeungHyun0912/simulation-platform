# 로컬 개발용 실행 worker(개발 DB의 job 큐를 읽는다). 운영에서 쓰지 않는다.
# 사용: backend/ 에서  .\scripts\run_dev_worker.ps1 [-Once]
# DATABASE_URL이 이미 설정되어 있으면 그 값을, 없으면 로컬 compose 개발 DB를 쓴다. API 서버(run_dev_api.ps1)와 별개 프로세스다.
param([switch]$Once)

$backend = Split-Path -Parent $PSScriptRoot
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/simulation_platform"
}
$env:APP_ENV = "development"
$python = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "가상환경이 없습니다: $python (backend/README.md의 설치 절차를 먼저 수행하세요)" }

Set-Location $backend
if ($Once) { & $python -m simulation_platform.worker --once } else { & $python -m simulation_platform.worker }
