$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$start = Join-Path $scriptDir 'start-core.ps1'
$taskName = 'XiaoshenRuntime'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$start`""
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $atLogon -Settings $settings -Description '小深 QQ 运行时：登录时启动核心，不周期自愈' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "已安装计划任务：$taskName"
