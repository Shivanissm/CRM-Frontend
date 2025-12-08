@if "%SCM_TRACE_LEVEL%"=="" echo off
@echo Handling node.js deployment.

:: 1. Select node version
call :SelectNodeVersion

:: 2. Install dependencies
call :InstallDependencies

:: 3. Build the project
call :BuildProject

:: 4. Deploy to wwwroot
call :DeployToWwwroot

goto :end

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
echo STEP 3: REMOVING ALL FILES FROM WWWROOT
echo ==========================================
echo DEPLOYMENT_TARGET: %DEPLOYMENT_TARGET%
echo DEPLOYMENT_SOURCE: %DEPLOYMENT_SOURCE%
echo.
echo IMPORTANT: Removing EVERYTHING inside wwwroot first
echo IMPORTANT: NOT touching site folder or parent directories

REM FIRST: Clean wwwroot completely - remove ALL files and folders
REM DEPLOYMENT_TARGET is the full path to wwwroot (e.g., D:\home\site\wwwroot)
REM We only clean wwwroot, never touch the site folder
if exist "%DEPLOYMENT_TARGET%" (
    echo.
    echo Current contents BEFORE cleaning:
    dir /b "%DEPLOYMENT_TARGET%" 2>nul || echo (empty or error)
    echo.
    echo Removing all files and folders...
    del /F /Q "%DEPLOYMENT_TARGET%\*" 2>nul
    for /d %%p in ("%DEPLOYMENT_TARGET%\*") do rmdir /s /q "%%p" 2>nul
    REM Also remove any nested wwwroot, site, or dist folders (shouldn't exist, but just in case)
    if exist "%DEPLOYMENT_TARGET%\wwwroot" rmdir /s /q "%DEPLOYMENT_TARGET%\wwwroot" 2>nul
    if exist "%DEPLOYMENT_TARGET%\site" rmdir /s /q "%DEPLOYMENT_TARGET%\site" 2>nul
    if exist "%DEPLOYMENT_TARGET%\dist" rmdir /s /q "%DEPLOYMENT_TARGET%\dist" 2>nul
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
echo Deployment completed successfully!
echo wwwroot now contains ONLY: assets/, index.html, web.config
goto :eof

:error
echo An error occurred during deployment.
exit /b 1

:end

