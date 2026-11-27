Option Explicit

Dim fso, shell, scriptDir, rootDir, nodeExe, launcherPath, logDir, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
If LCase(fso.GetFileName(scriptDir)) = "app" Or LCase(fso.GetFileName(scriptDir)) = "scripts" Then
  rootDir = fso.GetParentFolderName(scriptDir)
Else
  rootDir = scriptDir
End If

' 1. Find Node.js runtime in runtime/ first (portable mode), then fallback to PATH
nodeExe = ""
If fso.FileExists(rootDir & "\runtime\node.exe") Then
  nodeExe = rootDir & "\runtime\node.exe"
ElseIf fso.FileExists(rootDir & "\runtime\bin\node.exe") Then
  nodeExe = rootDir & "\runtime\bin\node.exe"
ElseIf fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeExe = "C:\Program Files\nodejs\node.exe"
Else
  On Error Resume Next
  Dim execObj
  Set execObj = shell.Exec("where.exe node.exe")
  If Err.Number = 0 Then
    Dim line
    Do While Not execObj.StdOut.AtEndOfStream
      line = Trim(execObj.StdOut.ReadLine())
      If line <> "" And fso.FileExists(line) Then
        nodeExe = line
        Exit Do
      End If
    Loop
  End If
  On Error GoTo 0
End If

' 2. Find launcher.mjs in app/ or scripts/
launcherPath = ""
If fso.FileExists(rootDir & "\app\launcher.mjs") Then
  launcherPath = rootDir & "\app\launcher.mjs"
ElseIf fso.FileExists(rootDir & "\scripts\launcher.mjs") Then
  launcherPath = rootDir & "\scripts\launcher.mjs"
End If

Sub WriteErrorLog(msg)
  On Error Resume Next
  logDir = rootDir & "\logs"
  If Not fso.FolderExists(logDir) Then
    fso.CreateFolder(logDir)
  End If
  Dim tsFile
  Set tsFile = fso.OpenTextFile(logDir & "\app.log", 8, True, -1)
  tsFile.WriteLine "[" & Now & "] [VBS:ERROR] " & msg
  tsFile.Close
  On Error GoTo 0
End Sub

Dim msgTitle, msgNoNodeBox, msgNoLauncherBox
msgTitle = ChrW(3610) & ChrW(3633) & ChrW(3609) & ChrW(3607) & ChrW(3638) & ChrW(3585) & ChrW(3591) & ChrW(3634) & ChrW(3609) & ChrW(3611) & ChrW(3619) & ChrW(3632) & ChrW(3592) & ChrW(3635) & ChrW(3623) & ChrW(3633) & ChrW(3609)
msgNoNodeBox = ChrW(3652) & ChrW(3617) & ChrW(3656) & ChrW(3614) & ChrW(3610) & ChrW(3605) & ChrW(3633) & ChrW(3623) & ChrW(3619) & ChrW(3633) & ChrW(3609) & ChrW(3650) & ChrW(3611) & ChrW(3619) & ChrW(3649) & ChrW(3585) & ChrW(3619) & ChrW(3617) & " (Node.js runtime) " & ChrW(3651) & ChrW(3609) & ChrW(3650) & ChrW(3615) & ChrW(3621) & ChrW(3648) & ChrW(3604) & ChrW(3629) & ChrW(3619) & ChrW(3660) & " runtime/"
msgNoLauncherBox = ChrW(3652) & ChrW(3617) & ChrW(3656) & ChrW(3614) & ChrW(3610) & ChrW(3652) & ChrW(3615) & ChrW(3621) & ChrW(3660) & ChrW(3605) & ChrW(3633) & ChrW(3623) & ChrW(3650) & ChrW(3611) & ChrW(3619) & ChrW(3649) & ChrW(3585) & ChrW(3619) & ChrW(3617) & " (app/launcher.mjs)"

If nodeExe = "" Then
  WriteErrorLog msgNoNodeBox
  MsgBox msgNoNodeBox, 16, msgTitle
  WScript.Quit 1
End If

If launcherPath = "" Then
  WriteErrorLog msgNoLauncherBox
  MsgBox msgNoLauncherBox, 16, msgTitle
  WScript.Quit 1
End If

shell.CurrentDirectory = rootDir
cmd = """" & nodeExe & """ """ & launcherPath & """"
shell.Run cmd, 0, False
