' Abre o widget do TaskON sem mostrar janela de console
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = folder
shell.Run """" & folder & "\node_modules\electron\dist\electron.exe"" .", 0, False
