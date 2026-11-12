Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = appDir
sh.Environment("Process")("ELECTRON_RUN_AS_NODE") = ""
electronExe = appDir & "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electronExe) Then
  sh.Run """" & electronExe & """ .", 1, False
Else
  MsgBox "Electron binary not found. Run npm install in " & appDir, vbCritical, "EcoBill Desktop"
End If

