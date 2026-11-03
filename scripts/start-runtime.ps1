$ErrorActionPreference = 'Continue'
$script = Join-Path $PSScriptRoot 'start-all.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Resume
