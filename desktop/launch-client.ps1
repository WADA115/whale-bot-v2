$env:ELECTRON_RUN_AS_NODE = $null
Start-Process -FilePath (Join-Path $PSScriptRoot 'dist\小鲸鱼面板.exe') -WorkingDirectory (Join-Path $PSScriptRoot 'dist')
