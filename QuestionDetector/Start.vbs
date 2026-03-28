Dim shell, appDir, cmd
Set shell = CreateObject("WScript.Shell")
appDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
cmd = Chr(34) & appDir & "node_modules\electron\dist\electron.exe" & Chr(34) & " " & Chr(34) & Left(appDir, Len(appDir)-1) & Chr(34)
shell.Environment("Process")("ELECTRON_RUN_AS_NODE") = ""
shell.Run cmd, 0, False
Set shell = Nothing
