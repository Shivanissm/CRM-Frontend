# Troubleshooting: Still Seeing 31 Files in wwwroot

If you're still seeing 31 files in wwwroot after deployment, follow these steps:

## Step 1: Check Azure Deployment Logs

1. Go to **Azure Portal** → Your App Service
2. Navigate to **Deployment Center** → **Logs**
3. Look for the deployment log and check:
   - Is `deploy.sh` being executed?
   - Do you see "STEP 0: CLEANING WWWROOT FIRST" in the logs?
   - Are there any errors during the cleaning step?

## Step 2: Verify Azure Configuration

In **Azure Portal** → **Configuration** → **General Settings**:

1. **Build Command**: Should be **EMPTY** (or removed)
2. **Post Build Command**: Should be **EMPTY** (or removed)
3. **Output Directory**: Should be **EMPTY**

If these are set, Azure might be doing a default deployment that copies everything.

## Step 3: Verify .deployment File

Make sure `.deployment` file exists in your repository root with:
```
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=true
COMMAND=deploy.sh
```

## Step 4: Check if Script is Running

The script should output:
- "STEP 0: CLEANING WWWROOT FIRST"
- "STEP 1: Installing dependencies"
- "STEP 2: Building project"
- "STEP 3: FINAL CLEAN OF WWWROOT"
- "STEP 4: COPYING FILES FROM DIST TO WWWROOT"

If you don't see these steps, the script might not be running.

## Step 5: Manual Verification

If the script is running but files remain, try this:

1. SSH into your Azure App Service (or use Kudu console)
2. Navigate to `/home/site/wwwroot`
3. Check what files are there
4. Manually run: `rm -rf /home/site/wwwroot/*`
5. Then manually copy files from `/home/site/repository/dist`

## Step 6: Alternative Solution

If the script still doesn't work, you can:

1. Set **Build Command** in Azure to: `npm run build`
2. Set **Post Build Command** to: `rm -rf /home/site/wwwroot/* && cp -r /home/site/repository/dist/* /home/site/wwwroot/`

But this is less reliable than using the deployment script.

## Common Issues

### Issue: Script not running
**Solution**: Check `.deployment` file exists and `COMMAND=deploy.sh` is set

### Issue: Azure copying files after script
**Solution**: The script now cleans wwwroot at the very beginning (Step 0) to prevent this

### Issue: Permissions error
**Solution**: Make sure `deploy.sh` has execute permissions (should be automatic in git)

### Issue: Script runs but files remain
**Solution**: Check if Azure is doing a post-deployment step that copies files. Disable any post-build commands in Azure Configuration.

## Expected Result

After successful deployment, `wwwroot` should contain ONLY:
- `assets/` (directory with JS and CSS files)
- `index.html`
- `web.config`

Total: 1 directory + 2 files = 3 items

If you see more, the deployment script didn't work correctly.

