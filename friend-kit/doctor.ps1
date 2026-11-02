param(
  [string]$KitRoot = $PSScriptRoot,
  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Continue"
if (-not $ConfigPath -or $ConfigPath.Trim() -eq "") {
  $ConfigPath = Join-Path $KitRoot "config.friend.json"
}
$ConfigPath = [System.IO.Path]::GetFullPath($ConfigPath)
$blockers = 0
$warnings = 0

function Ok([string]$Text) { Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Warn([string]$Text) { Write-Host "  [WARN] $Text" -ForegroundColor Yellow; $script:warnings += 1 }
function Fail([string]$Text) { Write-Host "  [FAIL] $Text" -ForegroundColor Red; $script:blockers += 1 }

Write-Host ""
Write-Host "  小深 QQ 运行时 · 朋友版自检" -ForegroundColor Cyan
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Fail "找不到 node。请安装 Node.js 22 或更高。"
} else {
  $version = (& node -p "process.versions.node" 2>$null)
  $major = 0
  try { $major = [int](($version -split "\.")[0]) } catch { $major = 0 }
  if ($major -ge 22) { Ok "Node.js $version" } else { Fail "Node.js $version，需要 22 或更高。" }
}

if (-not (Test-Path $ConfigPath)) {
  Fail "找不到配置：$ConfigPath，先运行 setup.ps1。"
} else {
  try {
    $config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Ok "配置可读：$ConfigPath"
  } catch {
    Fail "配置不是合法 JSON：$($_.Exception.Message)"
    $config = $null
  }
}

if ($config) {
  if ($config.mode -eq "live") { Ok "模式：live" } else { Warn "模式是 $($config.mode)，还不是 live。" }

  $stateRoot = Join-Path $KitRoot "friend-state"
  if (Test-Path $stateRoot) { Ok "数据目录存在：friend-state" } else { Warn "friend-state 还没建，运行 setup 或启动后会建。" }

  if ($config.allow.private -and @($config.allow.private).Count -gt 0) {
    Ok "私聊白名单非空"
  } else {
    Fail "私聊白名单为空，没人能用。"
  }
  if ($config.allow.groups -and @($config.allow.groups).Count -gt 0) {
    Ok "群白名单非空"
  } else {
    Warn "群白名单为空，只能私聊。"
  }

  $secretsPath = Join-Path $KitRoot $config.secretsFile
  if (Test-Path $secretsPath) {
    try {
      $secrets = Get-Content $secretsPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($secrets.deepseekApiKey) { Ok "DeepSeek Key 已设置" } else { Warn "DeepSeek Key 为空，文本模型可能不可用。" }
      if ($secrets.snowlumaAccessToken) { Ok "SnowLuma HTTP token 已设置" } else { Warn "SnowLuma HTTP token 为空。" }
      if ($secrets.snowlumaWsAccessToken) { Ok "SnowLuma WS token 已设置" } else { Warn "SnowLuma WS token 为空。" }
    } catch { Fail "secrets.json 不是合法 JSON。" }
  } else {
    Warn "找不到 secrets.json：$secretsPath"
  }

  $httpPort = 0
  try { $httpPort = ([Uri]$config.gateway.httpUrl).Port } catch {}
  $wsPort = 0
  try { $wsPort = ([Uri]$config.gateway.wsUrl).Port } catch {}
  $healthPort = [int]$config.healthPort

  foreach ($port in @($httpPort, $wsPort)) {
    if (-not $port) { Fail "SnowLuma 端口没有配置。"; continue }
    $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listen) { Ok "端口 $port 在监听" } else { Fail "端口 $port 没有监听，SnowLuma 或 OneBot 没开。" }
  }

  $healthListen = Get-NetTCPConnection -LocalPort $healthPort -State Listen -ErrorAction SilentlyContinue
  if ($healthListen) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$healthPort/healthz" -TimeoutSec 5
      if ($health.ok) { Ok "运行时已启动，connected=$($health.connected)" } else { Warn "运行时在，但还没连上 QQ。" }
    } catch { Warn "端口 $healthPort 在，但 /healthz 没有响应。" }
  } else {
    Warn "运行时还没启动；启动前端口 $healthPort 空闲是正常的。"
  }

  if ($config.gateway.httpUrl -match "127\.0\.0\.1|localhost") {
    Ok "SnowLuma 在本机"
  } else {
    Warn "SnowLuma 不是本机地址，确认 token 和防火墙。"
  }

  if ($healthPort -eq 3201) {
    Warn "健康端口是 3201，可能和正在运行的实例冲突。朋友版建议 3211。"
  }
}

Write-Host ""
if ($blockers -gt 0) {
  Write-Host "  结果：$blockers 个阻塞项，$warnings 个提醒。" -ForegroundColor Red
  exit 1
}
Write-Host "  结果：通过。$warnings 个提醒。" -ForegroundColor Green
exit 0
