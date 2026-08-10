' ALLU ERP - Launcher silencioso (nao abre CMD/PowerShell)
Dim fso, shell, appDir
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = appDir
shell.Run "cmd /c npm start", 0, False
