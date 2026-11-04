$ErrorActionPreference = 'Continue'
$v2 = Split-Path -Parent $PSScriptRoot
$maintenance = Join-Path $v2 'state\maintenance.flag'

if (Test-Path $maintenance) { Remove-Item $maintenance -Force -ErrorAction SilentlyContinue }
$listener = Get-NetTCPConnection -LocalPort 3201 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-core.ps1')
  Start-Sleep -Seconds 4
}
Start-Process 'http://127.0.0.1:3201/next/?page=gateway'
