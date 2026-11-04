$ErrorActionPreference = 'Stop'
$v2 = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$icon = Join-Path $v2 'web\assets\xiaoshen\xiaoshen.ico'
$openScript = Join-Path $PSScriptRoot 'open-panel.ps1'

$old = @('启动小深.lnk', '正常关闭小深.lnk', '小深 · DeepSeek Runtime.lnk', '小深.lnk')
foreach ($name in $old) {
  $path = Join-Path $desktop $name
  if (Test-Path $path) { Remove-Item $path -Force -ErrorAction SilentlyContinue }
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop '小深.lnk'))
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$openScript`""
$shortcut.WorkingDirectory = $v2
$shortcut.WindowStyle = 7
if (Test-Path $icon) { $shortcut.IconLocation = "$icon,0" }
$shortcut.Description = '打开小深控制面板'
$shortcut.Hotkey = 'Ctrl+Alt+S'
$shortcut.Save()

Write-Host '已整合为一个小深图标：打开控制面板（Ctrl+Alt+S）'
