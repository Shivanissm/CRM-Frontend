# Fix for KuduSync Copying All Files to wwwroot

## The Problem

Azure App Service uses **KuduSync** which runs BEFORE our `deploy.cmd` script. KuduSync copies ALL files from your repository to `wwwroot`, which is why you see 31 files instead of 3.

## The Solution

Our `deploy.cmd` script now:
1. Runs AFTER KuduSync (which is when Azure calls it)
2. **Aggressively cleans wwwroot** - removes ALL files/folders that KuduSync copied
3. Copies only the 3 files we need from `dist` folder

## Process Flow

```
1. Azure deploys code → KuduSync copies EVERYTHING to wwwroot (31 files)
   ↓
2. Azure runs deploy.cmd → Our script:
   - Installs dependencies
   - Builds project (creates dist/)
   - CLEANS wwwroot (removes all 31 files)
   - Copies only 3 files from dist
   ↓
3. Result: wwwroot contains only 3 files
```

## What Changed

The `deploy.cmd` script now:
- **Aggressively removes** all files/folders in wwwroot
- Uses multiple cleanup methods to ensure nothing remains
- Verifies the final result and warns if unexpected files are found

## Verification

After deployment, check the logs for:
- "STEP 3: CLEANING WWWROOT (AFTER KUDUSYNC)"
- "Found approximately X items (this is why we see 31 files!)"
- "wwwroot cleaned successfully"
- "SUCCESS: wwwroot contains only the expected files!"

## If Still Seeing 31 Files

1. **Check deployment logs** - Make sure the cleanup step ran
2. **Verify script execution** - Look for "STEP 3: CLEANING WWWROOT" in logs
3. **Check for errors** - If cleanup failed, files will remain

## Alternative: Disable KuduSync

If you want to prevent KuduSync from running at all, you can:
1. Use **Run From Package** deployment (`WEBSITE_RUN_FROM_PACKAGE=1`)
2. Or configure Azure to use a custom deployment that doesn't use KuduSync

But the current solution (cleaning after KuduSync) should work fine.

