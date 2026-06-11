!macro customInstall
  DetailPrint "Installing Hitch Face extension..."
  nsExec::ExecToLog 'node "$INSTDIR\resources\hitch-face\install-extension.js"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONINFORMATION|MB_OK "Hitch Face was installed, but the Hitch extension was not installed. Install Hitch from https://github.com/sagebynature/hitch and install Node.js 22.12+ so Hitch can run the adapter, then run: node \"$INSTDIR\resources\hitch-face\install-extension.js\""
  ${EndIf}

  FileOpen $1 "$INSTDIR\hitch-face.cmd" w
  FileWrite $1 '@echo off$\r$\n'
  FileWrite $1 'start "" "$INSTDIR\Hitch Face.exe" %*$\r$\n'
  FileClose $1
!macroend
