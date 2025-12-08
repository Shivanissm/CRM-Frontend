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
echo Deploying to wwwroot...
if exist "%DEPLOYMENT_TARGET%\wwwroot" (
    echo Cleaning wwwroot...
    rmdir /s /q "%DEPLOYMENT_TARGET%\wwwroot"
)
if not exist "%DEPLOYMENT_TARGET%\wwwroot" (
    mkdir "%DEPLOYMENT_TARGET%\wwwroot"
)
echo Copying files from dist to wwwroot...
xcopy /E /I /Y "%DEPLOYMENT_SOURCE%\dist\*" "%DEPLOYMENT_TARGET%\wwwroot\"
if %ERRORLEVEL% neq 0 goto error
echo Deployment completed successfully!
goto :eof

:error
echo An error occurred during deployment.
exit /b 1

:end

