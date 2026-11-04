@echo off
title Creating Lightweight Zip Package
color 0B
cd /d "%~dp0"

echo ===================================================
echo   Packaging AI Interview Helper for Sending
echo ===================================================
echo.
echo Packaging all project files (excluding node_modules)...
echo Output location: Your Desktop ^(AI-Interview-Helper-Ready.zip^)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$zipPath = Join-Path $desktop 'AI-Interview-Helper-Ready.zip';" ^
  "if (Test-Path $zipPath) { Remove-Item $zipPath -Force };" ^
  "$tempDir = Join-Path $env:TEMP ('ai_helper_pack_' + (Get-Random));" ^
  "New-Item -ItemType Directory -Path $tempDir -Force | Out-Null;" ^
  "robocopy . $tempDir /E /XD node_modules .git release logs /XF *.zip package-for-sending.bat /NFL /NDL /NJH /NJS | Out-Null;" ^
  "Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -Force;" ^
  "Remove-Item -Path $tempDir -Recurse -Force;" ^
  "Write-Host 'SUCCESS: Package created successfully!' -ForegroundColor Green;" ^
  "$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2);" ^
  "Write-Host ('Package Location: ' + $zipPath) -ForegroundColor Yellow;" ^
  "Write-Host ('Package Size: ' + $sizeMB + ' MB') -ForegroundColor Cyan;"

echo.
echo ===================================================
echo Done! You can send 'AI-Interview-Helper-Ready.zip'
echo directly to your sister via Google Drive, Telegram, etc.
echo (Your local project was not touched or modified)
echo ===================================================
echo.
pause
