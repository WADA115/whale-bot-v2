param([switch]$All, [switch]$KeepServices)

$ErrorActionPreference = 'Continue'
$v2 = Split-Path -Parent $PSScriptRoot
$maintenance = Join-Path $v2 'state\maintenance.flag'
$tokenFile = Join-Path $v2 'state\shutdown.token'
$health = 'http://127.0.0.1:3201/healthz'

New-Item -ItemType Directory -Force -Path (Split-Path $maintenance) | Out-Null
Set-Content -Path $maintenance -Value ('stopped ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -Encoding UTF8

function Port-Open($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Port-Open 3201)) {
  Write-Host 'v2 本来就没在跑。维护标记已放好。'
} elseif (-not (Test-Path $tokenFile)) {
  Write-Host '找不到 state\shutdown.token，无法正常关闭。'
  exit 1
} else {
  $token = (Get-Content $tokenFile -Raw -Encoding UTF8).Trim()
  try {
    Invoke-RestMethod -Uri 'http://127.0.0.1:3201/api/shutdown' -Method Post -Headers @{ 'x-shutdown-token' = $token } -TimeoutSec 5 | Out-Null
    Write-Host '已请求正常关闭。'
  } catch {
    Write-Host ('关闭请求失败：' + $_.Exception.Message)
    exit 1
  }
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline -and (Port-Open 3201)) { Start-Sleep -Milliseconds 300 }
  if (Port-Open 3201) {
    Write-Host 'v2 还在监听 3201，没有强行杀。'
    exit 1
  }
  Write-Host 'v2 已正常退出。'
}

Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'watchdog\.mjs' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (-not $KeepServices) {
  foreach ($port in 3000, 3001, 5099, 3199) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn -and $conn.OwningProcess) {
      $ownerId = [int]$conn.OwningProcess
      Write-Host ("停止端口 " + $port + "，进程 " + $ownerId)
      Stop-Process -Id $ownerId -Force -ErrorAction SilentlyContinue
    }
  }
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'asr-server\.py' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host 'SnowLuma / ASR / WebUI 已停止。'
}

Write-Host ''
Write-Host '维护标记：state\maintenance.flag（全部服务已关，QQ 未动）'
Write-Host '计划任务和 watchdog 不会再把 v2 拉起来。'
Write-Host '重新启动：scripts\start-runtime.ps1'
