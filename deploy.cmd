@if "%SCM_TRACE_LEVEL%"=="" echo off
setlocal enabledelayedexpansion
@echo ==========================================
@echo Azure App Service Deployment Script
@echo ==========================================
@echo.

:: Set paths
set DEPLOYMENT_SOURCE=%DEPLOYMENT_SOURCE%
set DEPLOYMENT_TARGET=%DEPLOYMENT_TARGET%
if "%DEPLOYMENT_SOURCE%"=="" set DEPLOYMENT_SOURCE=%CD%
if "%DEPLOYMENT_TARGET%"=="" set DEPLOYMENT_TARGET=C:\home\site\wwwroot

echo DEPLOYMENT_SOURCE: %DEPLOYMENT_SOURCE%
echo DEPLOYMENT_TARGET: %DEPLOYMENT_TARGET%
echo.

:: Step 1: Install dependencies
echo Step 1: Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 goto error

:: Step 2: Build project
echo.
echo Step 2: Building project...
call npm run build
if %ERRORLEVEL% neq 0 goto error

:: Step 3: AGGRESSIVE CLEANUP - Remove ALL files from wwwroot
echo.
echo ==========================================
echo Step 3: CLEANING WWWROOT
echo ==========================================
echo Removing ALL files/folders from wwwroot...
echo.

:: Use PowerShell for reliable cleanup
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
"$target = '%DEPLOYMENT_TARGET%'; ^
if (Test-Path $target) { ^
    Write-Host 'Removing all items from wwwroot...'; ^
    Get-ChildItem $target -Force | ForEach-Object { ^
        Write-Host \"Removing: $($_.Name)\"; ^
        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue ^
    }; ^
    Write-Host 'Cleanup complete. wwwroot is now empty.' ^
} else { ^
    Write-Host 'wwwroot does not exist, creating it...'; ^
    New-Item -ItemType Directory -Path $target -Force | Out-Null ^
}"

if %ERRORLEVEL% neq 0 (
    echo WARNING: PowerShell cleanup had issues, trying CMD fallback...
    cd /d "%DEPLOYMENT_TARGET%"
    del /F /Q /S *.* 2>nul
    for /d %%d in (*) do rmdir /s /q "%%d" 2>nul
    cd /d "%DEPLOYMENT_SOURCE%"
)

:: Step 4: Copy only 3 files from dist to wwwroot
echo.
echo ==========================================
echo Step 4: COPYING FILES FROM DIST
echo ==========================================
echo Copying only: assets/, index.html, web.config
echo.

:: Ensure wwwroot exists
if not exist "%DEPLOYMENT_TARGET%" mkdir "%DEPLOYMENT_TARGET%"

:: Copy assets folder
if exist "%DEPLOYMENT_SOURCE%\dist\assets" (
    xcopy /E /I /Y "%DEPLOYMENT_SOURCE%\dist\assets" "%DEPLOYMENT_TARGET%\assets\" >nul
    echo [OK] Copied: assets/
) else (
    echo [ERROR] assets folder not found in dist
    goto error
)

:: Copy index.html
if exist "%DEPLOYMENT_SOURCE%\dist\index.html" (
    copy /Y "%DEPLOYMENT_SOURCE%\dist\index.html" "%DEPLOYMENT_TARGET%\index.html" >nul
    echo [OK] Copied: index.html
) else (
    echo [ERROR] index.html not found in dist
    goto error
)

:: Copy web.config
if exist "%DEPLOYMENT_SOURCE%\dist\web.config" (
    copy /Y "%DEPLOYMENT_SOURCE%\dist\web.config" "%DEPLOYMENT_TARGET%\web.config" >nul
    echo [OK] Copied: web.config
) else (
    echo [ERROR] web.config not found in dist
    goto error
)

:: Step 5: Final verification and cleanup
echo.
echo ==========================================
echo Step 5: FINAL VERIFICATION
echo ==========================================

:: Remove any remaining unwanted files using PowerShell
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
"$target = '%DEPLOYMENT_TARGET%'; ^
$keep = @('assets', 'index.html', 'web.config'); ^
Get-ChildItem $target -Force | Where-Object { $keep -notcontains $_.Name } | ForEach-Object { ^
    Write-Host \"Removing unwanted item: $($_.Name)\"; ^
    Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue ^
}"

:: Verify final state
echo.
echo Final contents of wwwroot:
dir /b "%DEPLOYMENT_TARGET%" 2>nul

:: Count items
set file_count=0
set dir_count=0
for /f %%i in ('dir /b /a-d "%DEPLOYMENT_TARGET%" 2^>nul ^| find /c /v ""') do set file_count=%%i
for /f %%i in ('dir /b /ad "%DEPLOYMENT_TARGET%" 2^>nul ^| find /c /v ""') do set dir_count=%%i

echo.
echo Summary: !dir_count! directories, !file_count! files
echo Expected: 1 directory (assets), 2 files (index.html, web.config)

if !file_count! EQU 2 if !dir_count! EQU 1 (
    echo.
    echo ==========================================
    echo SUCCESS: wwwroot contains exactly 3 items!
    echo ==========================================
) else (
    echo.
    echo WARNING: Unexpected file count. Listing all items:
    dir /b "%DEPLOYMENT_TARGET%"
)

echo.
echo Deployment completed!
goto :end

:error
echo.
echo ==========================================
echo DEPLOYMENT FAILED
echo ==========================================
exit /b 1

:end
