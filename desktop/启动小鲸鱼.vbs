Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(here)
ps = root & "\scripts\start-core.ps1"
sh.CurrentDirectory = here
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps & """", 0, True
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & here & "\launch-client.ps1""", 0, False
