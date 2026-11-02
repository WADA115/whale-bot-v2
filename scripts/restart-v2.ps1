$ErrorActionPreference = 'Continue'
$src = Split-Path -Parent $PSScriptRoot
$node$node = if ($env:NODE_EXE) { $env:NODE_EXE } else { 'node.exe' }
Start-Sleep -Seconds 2
$listener = Get-NetTCPConnection -LocalPort 3201 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
Start-Process -FilePath $node -ArgumentList @('src\index.js') -WorkingDirectory $src -WindowStyle Hidden
