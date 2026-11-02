param(
  [string]$KitRoot = $PSScriptRoot,
  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"
if (-not $ConfigPath -or $ConfigPath.Trim() -eq "") {
  $ConfigPath = Join-Path $KitRoot "config.friend.json"
}
$ConfigPath = [System.IO.Path]::GetFullPath($ConfigPath)

if (-not (Test-Path $ConfigPath)) {
  Write-Host "找不到 $ConfigPath，先运行 setup.ps1。" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  启动朋友版运行时" -ForegroundColor Cyan
Write-Host "  config: $ConfigPath" -ForegroundColor DarkGray
Write-Host ""

Set-Location $KitRoot
& node src/index.js --config $ConfigPath
exit $LASTEXITCODE
