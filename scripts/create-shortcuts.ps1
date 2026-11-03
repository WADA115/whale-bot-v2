$ErrorActionPreference = 'Stop'
$v2 = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$icon = Join-Path $v2 'web\assets\xiaoshen\xiaoshen.ico'
$startScript = Join-Path $PSScriptRoot 'start-runtime.ps1'
$stopScript = Join-Path $PSScriptRoot 'stop-all.ps1'

function New-Shortcut($path, $arguments, $hotkey, $name) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = 'powershell.exe'
  $shortcut.Arguments = $arguments
  $shortcut.WorkingDirectory = $v2
  $shortcut.WindowStyle = 7
  if (Test-Path $icon) { $shortcut.IconLocation = "$icon,0" }
  $shortcut.Description = $name
  $shortcut.Hotkey = $hotkey
  $shortcut.Save()
  Write-Host "已创建：$path（$hotkey）"
}

New-Shortcut (Join-Path $desktop '启动小深.lnk') "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`"" 'Ctrl+Alt+S' '小深：启动并恢复正常运行'
New-Shortcut (Join-Path $desktop '正常关闭小深.lnk') "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$stopScript`"" 'Ctrl+Alt+Q' '小深：正常关闭并进入维护状态'
