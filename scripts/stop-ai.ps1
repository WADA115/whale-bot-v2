$ErrorActionPreference = 'Continue'
$ports = 3199, 9881, 9880, 11434
$seen = @{}
$stopped = @()
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $conns) {
    $procId = [int]$conn.OwningProcess
    if ($procId -le 0 -or $seen.ContainsKey($procId)) { continue }
    $seen[$procId] = $true
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    try {
      & taskkill.exe /PID $procId /T /F *> $null
      $stopped += "$($proc.ProcessName):$procId"
    } catch {}
  }
}
$stopped | ForEach-Object { Write-Output "stopped $_" }
