param([switch]$NoOpen)

$ErrorActionPreference = 'Continue'
$src = Split-Path -Parent $PSScriptRoot
$health = 'http://127.0.0.1:3201/healthz'
$url = 'http://127.0.0.1:3201/next/'

function Up {
  try { return (Invoke-RestMethod -Uri $health -TimeoutSec 2).ok -eq $true } catch { return $false }
}

if (-not (Up)) {
  Write-Host '正在启动小深运行时…'
  & (Join-Path $src 'scripts\start-all.ps1')
}

$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline -and -not (Up)) {
  Start-Sleep -Milliseconds 800
}

if (Up) {
  if (-not $NoOpen) { Start-Process $url }
} else {
  Write-Host ''
  Write-Host '运行时没有起来。请检查：'
  Write-Host '  1. QQ 是否已登录'
  Write-Host '  2. SnowLuma 是否在 5099'
  Write-Host '  3. 3201 是否被占用'
  Start-Sleep -Seconds 8
}
