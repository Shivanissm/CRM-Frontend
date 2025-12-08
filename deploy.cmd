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
echo Deploying to wwwroot - only copying built files...
echo DEPLOYMENT_TARGET is already wwwroot: %DEPLOYMENT_TARGET%

REM Clean wwwroot completely - DEPLOYMENT_TARGET IS wwwroot
if exist "%DEPLOYMENT_TARGET%" (
    echo Cleaning wwwroot...
    del /F /Q "%DEPLOYMENT_TARGET%\*" 2>nul
    for /d %%p in ("%DEPLOYMENT_TARGET%\*") do rmdir /s /q "%%p" 2>nul
) else (
    mkdir "%DEPLOYMENT_TARGET%"
)

echo Copying only built files: assets, index.html, web.config...
if exist "%DEPLOYMENT_SOURCE%\dist\assets" (
    xcopy /E /I /Y "%DEPLOYMENT_SOURCE%\dist\assets" "%DEPLOYMENT_TARGET%\assets\"
    echo Copied: assets/
)
if exist "%DEPLOYMENT_SOURCE%\dist\index.html" (
    copy /Y "%DEPLOYMENT_SOURCE%\dist\index.html" "%DEPLOYMENT_TARGET%\"
    echo Copied: index.html
)
if exist "%DEPLOYMENT_SOURCE%\dist\web.config" (
    copy /Y "%DEPLOYMENT_SOURCE%\dist\web.config" "%DEPLOYMENT_TARGET%\"
    echo Copied: web.config
)
if %ERRORLEVEL% neq 0 goto error
echo Deployment completed successfully! Only built files copied to wwwroot.
goto :eof

:error
echo An error occurred during deployment.
exit /b 1

:end

