$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force -Path (Join-Path $root "backups") | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $root "backups\avitoops-$stamp.sql"
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "pg_dump не найден в PATH. Поставьте клиент PostgreSQL и запускайте скрипт раз в сутки."
}
if (-not $env:DATABASE_URL) {
  Write-Error "Задайте DATABASE_URL"
}
& pg_dump $env:DATABASE_URL --no-owner --file $target
Write-Output $target
