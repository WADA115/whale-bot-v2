param(
  [string]$KitRoot = $PSScriptRoot,
  [string]$ConfigPath = "",
  [string]$SnowlumaHttp = "http://127.0.0.1:3000",
  [string]$SnowlumaWs = "ws://127.0.0.1:3001",
  [string]$HttpToken = "",
  [string]$WsToken = "",
  [string]$DeepSeekKey = "",
  [string]$PrivateId = "",
  [string]$GroupIds = "",
  [int]$HealthPort = 3211,
  [switch]$NonInteractive,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $ConfigPath -or $ConfigPath.Trim() -eq "") {
  $ConfigPath = Join-Path $KitRoot "config.friend.json"
}
$ConfigPath = [System.IO.Path]::GetFullPath($ConfigPath)

function Ask-Text([string]$Prompt, [string]$Default = "") {
  if ($NonInteractive) { return $Default }
  $suffix = if ($Default) { " [$Default]" } else { "" }
  $value = Read-Host ($Prompt + $suffix)
  if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
  return $value.Trim()
}

function Ask-Secret([string]$Prompt, [string]$Provided = "") {
  if ($NonInteractive) { return $Provided }
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host ""
Write-Host "  小深 QQ 运行时 · 朋友版配置向导" -ForegroundColor Cyan
Write-Host "  不会修改当前的 config.json 或 state。" -ForegroundColor DarkGray
Write-Host ""

if ((Test-Path $ConfigPath) -and -not $Force) {
  $answer = Read-Host "config.friend.json 已存在，覆盖？[y/N]"
  if ($answer -notmatch "^(y|Y|yes|YES)$") {
    Write-Host "已取消，没有改动任何文件。" -ForegroundColor Yellow
    exit 0
  }
}

$template = Join-Path $KitRoot "config.friend.example.json"
if (-not (Test-Path $template)) { throw "缺少 config.friend.example.json" }
$config = Get-Content $template -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not $NonInteractive) {
  $SnowlumaHttp = Ask-Text "SnowLuma HTTP 地址" $SnowlumaHttp
  $SnowlumaWs = Ask-Text "SnowLuma WS 地址" $SnowlumaWs
  $HttpToken = Ask-Secret "SnowLuma HTTP access token（不显示）" $HttpToken
  $WsToken = Ask-Secret "SnowLuma WS access token（不显示）" $WsToken
  $DeepSeekKey = Ask-Secret "DeepSeek API Key（不显示）" $DeepSeekKey
  $PrivateId = Ask-Text "你的 QQ 号（只允许这个号私聊）" $PrivateId
  $GroupIds = Ask-Text "要加入的群号（逗号分隔，可留空）" $GroupIds
}

if (-not $PrivateId) { throw "必须填写私聊白名单 QQ 号。加群前先确保自己能用。" }
if (-not $DeepSeekKey) { Write-Host "提示：没有填 DeepSeek Key，启动后文本模型会不可用。" -ForegroundColor Yellow }

$groupList = @()
if ($GroupIds) {
  $groupList = $GroupIds.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

$config.mode = "live"
$config.healthPort = $HealthPort
$config.gateway.httpUrl = $SnowlumaHttp
$config.gateway.wsUrl = $SnowlumaWs
$config.gateway.accessToken = $HttpToken
$config.gateway.wsAccessToken = $WsToken
$config.allow.private = @($PrivateId)
$config.allow.groups = @($groupList)
$config.secretsFile = "friend-state/secrets.json"

$dirs = @(
  "friend-state",
  "friend-state/story",
  "friend-state/logs",
  "friend-state/voice",
  "friend-state/tasks",
  "friend-state/knowledge"
)
foreach ($dir in $dirs) {
  $full = Join-Path $KitRoot $dir
  if (-not (Test-Path $full)) { New-Item -ItemType Directory -Path $full -Force | Out-Null }
}

$config | ConvertTo-Json -Depth 30 | Set-Content -Path $ConfigPath -Encoding UTF8

$secretsPath = Join-Path $KitRoot "friend-state/secrets.json"
$secrets = @{
  deepseekApiKey = $DeepSeekKey
  snowlumaAccessToken = $HttpToken
  snowlumaWsAccessToken = $WsToken
}
$secrets | ConvertTo-Json -Depth 5 | Set-Content -Path $secretsPath -Encoding UTF8

Write-Host ""
Write-Host "配置已写入：" -ForegroundColor Green
Write-Host "  $ConfigPath"
Write-Host "  $secretsPath"
Write-Host ""
Write-Host "下一步：" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File .\doctor.ps1"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\start.ps1"
