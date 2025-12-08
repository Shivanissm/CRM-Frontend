# CRITICAL: Azure Configuration Fix for 33 Files Issue

## The Root Cause

Azure is using `--no-dot-deployment` flag, which **ignores your `.deployment` file**. This means:
1. KuduSync runs and copies ALL files to wwwroot (33 files)
2. Our cleanup script runs, but might not be aggressive enough
3. Or Azure might be copying files after our script runs

## Solution: Configure Azure Portal Settings

You MUST configure Azure Portal to prevent KuduSync from copying everything:

### Step 1: Go to Azure Portal
1. Navigate to your **App Service**
2. Go to **Configuration** → **General Settings**

### Step 2: Configure Deployment Settings

**IMPORTANT**: Set these values:

1. **SCM_DO_BUILD_DURING_DEPLOYMENT**: `true` (should already be set)

2. **WEBSITE_RUN_FROM_PACKAGE**: Leave **EMPTY** or set to `0`
   - If this is set to `1`, wwwroot becomes read-only and our cleanup won't work!

3. **Build Command**: Leave **EMPTY**
   - Don't set any build command here

4. **Post Build Command**: Leave **EMPTY**
   - Don't set any post-build command here

### Step 3: Use Custom Deployment Script

The `.deployment` file should have:
```
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=true
COMMAND=deploy.cmd
```

But since Azure is using `--no-dot-deployment`, you need to:

**Option A: Use Azure CLI to set deployment script**
```bash
az webapp deployment source config --name <your-app-name> --resource-group <your-resource-group> --manual-integration
```

**Option B: Configure in Azure Portal**
1. Go to **Deployment Center**
2. Under **Settings**, make sure **Build Provider** is set correctly
3. Check **Deployment script** settings

### Step 4: Alternative - Use Startup Command

If the cleanup still doesn't work, add a **Startup Command** in Azure Portal:

**Configuration** → **General Settings** → **Startup Command**:

```cmd
cmd /c "cd /d C:\home\site\wwwroot && for /d %%d in (*) do @if not \"%%d\"==\"assets\" rmdir /s /q \"%%d\" 2>nul && for %%f in (*) do @if not \"%%f\"==\"index.html\" if not \"%%f\"==\"web.config\" del /f /q \"%%f\" 2>nul"
```

This will clean wwwroot on every app start.

## What I've Updated

1. **deploy.cmd**: Now uses 7 different cleanup methods including PowerShell
2. **Enabled delayed expansion**: For proper variable handling
3. **Final aggressive cleanup**: Removes everything except our 3 files after copying
4. **Emergency cleanup**: If verification fails, runs one more cleanup

## Next Steps

1. **Check Azure Configuration** - Make sure `WEBSITE_RUN_FROM_PACKAGE` is NOT set to `1`
2. **Deploy again** - The new cleanup should work
3. **Check logs** - Look for "FINAL AGGRESSIVE CLEANUP" in deployment logs
4. **If still 33 files** - Use the Startup Command method above

## Verification

After deployment, check logs for:
- "STEP 3: AGGRESSIVE CLEANUP OF WWWROOT"
- "FINAL AGGRESSIVE CLEANUP"
- "SUCCESS: wwwroot contains only the expected files!"

If you see "ERROR: More than 2 files found!", the cleanup didn't work and you need to use the Startup Command method.

