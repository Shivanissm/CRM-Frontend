@echo off
REM Post-deployment cleanup script
REM This runs AFTER deploy.cmd to ensure wwwroot is clean

echo ==========================================
echo POST-DEPLOYMENT CLEANUP
echo ==========================================
echo Cleaning wwwroot one more time...

set DEPLOYMENT_TARGET=%DEPLOYMENT_TARGET%
if "%DEPLOYMENT_TARGET%"=="" set DEPLOYMENT_TARGET=C:\home\site\wwwroot

echo Target: %DEPLOYMENT_TARGET%

if exist "%DEPLOYMENT_TARGET%" (
    echo Removing all files except assets/, index.html, web.config...
    
    REM Remove all directories except assets
    for /d %%d in ("%DEPLOYMENT_TARGET%\*") do (
        if /i not "%%~nxd"=="assets" (
            echo Removing: %%d
            rmdir /s /q "%%d" 2>nul
        )
    )
    
    REM Remove all files except index.html and web.config
    for %%f in ("%DEPLOYMENT_TARGET%\*") do (
        if /i not "%%~nxf"=="index.html" if /i not "%%~nxf"=="web.config" (
            echo Removing: %%f
            del /f /q "%%f" 2>nul
        )
    )
    
    echo.
    echo Final contents:
    dir /b "%DEPLOYMENT_TARGET%"
    echo.
    echo Post-deployment cleanup complete!
)

