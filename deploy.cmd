@if "%SCM_TRACE_LEVEL%"=="" echo off
@echo ==========================================
@echo Azure App Service Deployment Script
@echo ==========================================
@echo.
@echo IMPORTANT: Azure uses KuduSync which copies ALL files to wwwroot FIRST
@echo Our script runs AFTER KuduSync, so we clean wwwroot at the END
@echo.

:: Note: KuduSync runs BEFORE this script and copies everything to wwwroot
:: We will clean wwwroot AFTER building, then copy only the 3 files we need

:: 1. Select node version
call :SelectNodeVersion

:: 2. Install dependencies
call :InstallDependencies

:: 3. Build the project
call :BuildProject

:: 4. Final clean and deploy to wwwroot
call :DeployToWwwroot

goto :end

REM CleanWwwrootFirst function removed - we clean AFTER KuduSync runs
REM KuduSync copies everything BEFORE our script runs, so we clean in DeployToWwwroot

:SelectNodeVersion
echo Selecting Node.js version...
:: Azure will handle this automatically, but you can specify version if needed
goto :eof

:InstallDependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 goto error
goto :eof

:BuildProject
echo Building project...
call npm run build
if %ERRORLEVEL% neq 0 goto error
goto :eof

:DeployToWwwroot
echo.
echo ==========================================
echo STEP 3: CLEANING WWWROOT (AFTER KUDUSYNC)
echo ==========================================
echo DEPLOYMENT_TARGET: %DEPLOYMENT_TARGET%
echo DEPLOYMENT_SOURCE: %DEPLOYMENT_SOURCE%
echo.
echo CRITICAL: KuduSync has already copied ALL files to wwwroot
echo We must now REMOVE everything and copy only the 3 files we need
echo.

REM CRITICAL: Clean wwwroot completely - KuduSync copied everything here
REM DEPLOYMENT_TARGET is the full path to wwwroot (e.g., C:\home\site\wwwroot)
if exist "%DEPLOYMENT_TARGET%" (
    echo Current contents in wwwroot (KuduSync copied everything):
    dir /b "%DEPLOYMENT_TARGET%" 2>nul | find /c /v "" > temp_count.txt
    set /p file_count=<temp_count.txt
    del temp_count.txt
    echo Found approximately %file_count% items (this is why we see 31 files!)
    echo.
    echo Removing ALL files and folders from wwwroot...
    
    REM Use multiple methods to ensure complete cleanup
    del /F /Q "%DEPLOYMENT_TARGET%\*" 2>nul
    for /d %%p in ("%DEPLOYMENT_TARGET%\*") do (
        echo Removing folder: %%p
        rmdir /s /q "%%p" 2>nul
    )
    
    REM Remove any nested folders
    if exist "%DEPLOYMENT_TARGET%\wwwroot" rmdir /s /q "%DEPLOYMENT_TARGET%\wwwroot" 2>nul
    if exist "%DEPLOYMENT_TARGET%\site" rmdir /s /q "%DEPLOYMENT_TARGET%\site" 2>nul
    if exist "%DEPLOYMENT_TARGET%\dist" rmdir /s /q "%DEPLOYMENT_TARGET%\dist" 2>nul
    if exist "%DEPLOYMENT_TARGET%\src" rmdir /s /q "%DEPLOYMENT_TARGET%\src" 2>nul
    if exist "%DEPLOYMENT_TARGET%\node_modules" rmdir /s /q "%DEPLOYMENT_TARGET%\node_modules" 2>nul
    if exist "%DEPLOYMENT_TARGET%\public" rmdir /s /q "%DEPLOYMENT_TARGET%\public" 2>nul
    if exist "%DEPLOYMENT_TARGET%\scripts" rmdir /s /q "%DEPLOYMENT_TARGET%\scripts" 2>nul
    if exist "%DEPLOYMENT_TARGET%\reference" rmdir /s /q "%DEPLOYMENT_TARGET%\reference" 2>nul
    
    REM Force remove any remaining files
    for /f "delims=" %%i in ('dir /b /a "%DEPLOYMENT_TARGET%" 2^>nul') do (
        if exist "%DEPLOYMENT_TARGET%\%%i" (
            echo Force removing: %%i
            del /F /Q "%DEPLOYMENT_TARGET%\%%i" 2>nul
            rmdir /s /q "%DEPLOYMENT_TARGET%\%%i" 2>nul
        )
    )
    
    echo.
    echo Contents AFTER cleaning:
    dir /b "%DEPLOYMENT_TARGET%" 2>nul || echo (empty - correct!)
    echo.
    echo wwwroot cleaned successfully
) else (
    echo Creating wwwroot directory...
    mkdir "%DEPLOYMENT_TARGET%"
)

echo.
echo ==========================================
echo STEP 4: COPYING FILES FROM DIST TO WWWROOT
echo ==========================================
echo Source: %DEPLOYMENT_SOURCE%\dist
echo Target: %DEPLOYMENT_TARGET%
echo.
echo IMPORTANT: Copying ONLY 3 items from dist, NOT the dist folder itself
echo Items to copy: assets/, index.html, web.config
echo.
REM Copy assets folder from dist (NOT the dist folder, just assets/)
if exist "%DEPLOYMENT_SOURCE%\dist\assets" (
    xcopy /E /I /Y "%DEPLOYMENT_SOURCE%\dist\assets" "%DEPLOYMENT_TARGET%\assets\"
    echo Copied: assets/ (from dist\assets to wwwroot\assets)
) else (
    echo ERROR: assets folder not found in %DEPLOYMENT_SOURCE%\dist
    goto error
)

REM Copy index.html from dist (NOT the dist folder, just the file)
if exist "%DEPLOYMENT_SOURCE%\dist\index.html" (
    copy /Y "%DEPLOYMENT_SOURCE%\dist\index.html" "%DEPLOYMENT_TARGET%\"
    echo Copied: index.html (from dist\index.html to wwwroot\index.html)
) else (
    echo ERROR: index.html not found in %DEPLOYMENT_SOURCE%\dist
    goto error
)

REM Copy web.config from dist (NOT the dist folder, just the file)
if exist "%DEPLOYMENT_SOURCE%\dist\web.config" (
    copy /Y "%DEPLOYMENT_SOURCE%\dist\web.config" "%DEPLOYMENT_TARGET%\"
    echo Copied: web.config (from dist\web.config to wwwroot\web.config)
) else (
    echo ERROR: web.config not found in %DEPLOYMENT_SOURCE%\dist
    goto error
)

echo.
echo All 3 items copied successfully from dist to wwwroot
echo.

REM Final verification
echo ==========================================
echo FINAL VERIFICATION
echo ==========================================
echo Final contents of wwwroot:
dir /b "%DEPLOYMENT_TARGET%" 2>nul || echo (empty)
echo.

REM Count files
for /f %%i in ('dir /b /a-d "%DEPLOYMENT_TARGET%" 2^>nul ^| find /c /v ""') do set file_count=%%i
for /f %%i in ('dir /b /ad "%DEPLOYMENT_TARGET%" 2^>nul ^| find /c /v ""') do set dir_count=%%i

echo wwwroot now contains: %dir_count% directories, %file_count% files
echo Expected: 1 directory (assets), 2 files (index.html, web.config)
echo.

if %file_count% GTR 2 (
    echo WARNING: More than 2 files found! Listing all:
    dir /b "%DEPLOYMENT_TARGET%"
    echo.
    echo This might indicate KuduSync copied files after our cleanup.
) else (
    echo SUCCESS: wwwroot contains only the expected files!
)

echo.
echo Deployment completed successfully!
echo wwwroot now contains ONLY: assets/, index.html, web.config
goto :eof

:error
echo An error occurred during deployment.
exit /b 1

:end

