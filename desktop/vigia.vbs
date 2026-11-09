' Reabre o widget do TaskON se ele não estiver rodando (chamado pela tarefa agendada "TaskON")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
Set procs = GetObject("winmgmts:\\.\root\cimv2").ExecQuery( _
  "SELECT ProcessId FROM Win32_Process WHERE Name = 'electron.exe' AND CommandLine LIKE '%TaskON\\desktop%'")
If procs.Count = 0 Then
  Set shell = CreateObject("WScript.Shell")
  shell.CurrentDirectory = folder
  shell.Run """" & folder & "\node_modules\electron\dist\electron.exe"" . --vigia", 0, False
End If
