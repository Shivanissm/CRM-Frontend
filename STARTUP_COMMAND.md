# Azure Startup Command Configuration

## The Problem

KuduSync copies ALL files to wwwroot before our cleanup script runs, and the cleanup isn't working properly. You're seeing 35 files instead of 3.

## The Solution: Use Startup Command

Add a **Startup Command** in Azure Portal that cleans wwwroot on every app start. This ensures wwwroot is always clean, even if deployment cleanup fails.

## Step-by-Step Instructions

### Option 1: PowerShell Startup Command (Recommended)

1. Go to **Azure Portal** → Your App Service
2. Navigate to **Configuration** → **General Settings**
3. Scroll down to **Startup Command**
4. Paste this command:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\home\site\repository\clean-wwwroot.ps1" && node "D:\home\site\wwwroot\assets\index.*.js"
```

Or use this inline version:

```powershell
powershell -ExecutionPolicy Bypass -Command "$w='C:\home\site\wwwroot'; Get-ChildItem $w -Force | Where-Object { $_.Name -ne 'assets' -and $_.Name -ne 'index.html' -and $_.Name -ne 'web.config' } | Remove-Item -Recurse -Force; Write-Host 'wwwroot cleaned'"
```

### Option 2: CMD Startup Command

```cmd
cmd /c "cd /d C:\home\site\wwwroot && for /d %%d in (*) do @if not \"%%d\"==\"assets\" rmdir /s /q \"%%d\" 2>nul && for %%f in (*) do @if not \"%%f\"==\"index.html\" if not \"%%f\"==\"web.config\" del /f /q \"%%f\" 2>nul && echo wwwroot cleaned"
```

### Option 3: Simple PowerShell One-Liner

```powershell
powershell -Command "Get-ChildItem 'C:\home\site\wwwroot' -Force | Where-Object { $_.Name -ne 'assets' -and $_.Name -ne 'index.html' -and $_.Name -ne 'web.config' } | Remove-Item -Recurse -Force"
```

## How It Works

1. **On every app start**, Azure runs the Startup Command
2. The command **cleans wwwroot** - removes everything except assets/, index.html, web.config
3. Then the app starts normally
4. Result: wwwroot always contains only 3 items

## Important Notes

- This runs on **every app start**, not just deployment
- It ensures wwwroot is always clean
- The cleanup happens **before** your app serves files
- This is a reliable solution that works regardless of deployment issues

## After Setting Startup Command

1. **Save** the configuration
2. **Restart** your App Service
3. Check wwwroot - it should now contain only 3 items
4. Your app will work normally

## Alternative: Fix Deployment Script

If you prefer to fix the deployment script instead, the cleanup needs to be more aggressive. But the Startup Command is the most reliable solution.

