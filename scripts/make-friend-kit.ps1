param(
  [string]$Source = (Split-Path -Parent $PSScriptRoot),
  [string]$Output = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $Output -or $Output.Trim() -eq "") {
  $Output = Join-Path (Split-Path -Parent $Source) "release\xiaoshen-friend-kit"
}
$Output = [System.IO.Path]::GetFullPath($Output)
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $Source) "release"))
if (-not $Output.StartsWith($releaseRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "输出目录必须在 release 下面：$releaseRoot"
}

if (Test-Path $Output) {
  if (-not $Force) { throw "目录已存在：$Output（加 -Force 覆盖）" }
  Remove-Item $Output -Recurse -Force
}
New-Item -ItemType Directory -Path $Output -Force | Out-Null

$copyDirs = @("src", "web", "characters", "roles")
foreach ($dir in $copyDirs) {
  $from = Join-Path $Source $dir
  if (Test-Path $from) { Copy-Item $from -Destination $Output -Recurse -Force }
}

foreach ($file in @("package.json", "LICENSE")) {
  $from = Join-Path $Source $file
  if (Test-Path $from) { Copy-Item $from -Destination $Output -Force }
}

$next = Join-Path $Output "web\next"
if (Test-Path $next) {
  Get-ChildItem $next -File | Where-Object {
    $_.Name -like 'preview*.png' -or $_.Name -like 'check*.png' -or $_.Name -like 'borderless*.png'
  } | Remove-Item -Force
}

$kit = Join-Path $Source "friend-kit"
Copy-Item (Join-Path $kit "*") -Destination $Output -Recurse -Force

$stateDir = Join-Path $Output "friend-state"
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stateDir "story") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stateDir "logs") -Force | Out-Null

$zip = "$Output.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $Output "*") -DestinationPath $zip -CompressionLevel Optimal

Write-Host ""
Write-Host "朋友包已生成：" -ForegroundColor Green
Write-Host "  $Output"
Write-Host "  $zip"
Write-Host ""
Write-Host "压缩包只包含运行所需的 src / web / characters / roles / 启动脚本。" -ForegroundColor DarkGray
Write-Host "不包含 config.json、state、测试、截图或当前数据。" -ForegroundColor DarkGray
