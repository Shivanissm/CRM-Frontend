# Azure App Service Setup Instructions

## Important: Fix for Nested wwwroot and Multiple Files Issue

If you're seeing:
- A `wwwroot` folder inside `wwwroot` folder
- 30+ files in `wwwroot` instead of just 3 (assets, index.html, web.config)

Follow these steps:

## Step 1: Configure Azure App Service

1. Go to **Azure Portal** → Your App Service → **Configuration** → **General Settings**

2. **IMPORTANT**: Set these values:
   - **Build Command**: Leave **EMPTY** (or remove any existing value)
   - **Post Build Command**: Leave **EMPTY** (or remove any existing value)
   - **Output Directory**: Leave **EMPTY**

3. Azure will automatically use `deploy.sh` (Linux) or `deploy.cmd` (Windows) if present in the repository root.

## Step 2: Verify .deployment File

The `.deployment` file should contain:
```
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=true
COMMAND=deploy.sh
```

This tells Azure to:
- Run builds during deployment
- Use `deploy.sh` as the deployment script

## Step 3: How It Works

When you push to main branch:

1. Azure detects the push
2. Azure runs `deploy.sh` (our custom script)
3. The script:
   - Installs dependencies (`npm install`)
   - Builds the project (`npm run build`) → creates `dist` folder
   - **Cleans `wwwroot` completely** (removes ALL files/folders)
   - **Copies only 3 items** from `dist` to `wwwroot`:
     - `assets/` folder
     - `index.html`
     - `web.config`
4. Result: `wwwroot` contains exactly 3 items, no nested folders

## Step 4: Verify Deployment

After deployment, check `wwwroot` should contain:
```
wwwroot/
  ├── assets/
  │   ├── index.[hash].js
  │   └── index.[hash].css
  ├── index.html
  └── web.config
```

**That's it!** No other files or folders.

## Troubleshooting

### Still seeing nested wwwroot?

1. Check Azure logs: **Deployment Center** → **Logs**
2. Verify `deploy.sh` is in the repository root
3. Make sure `.deployment` file exists and has `COMMAND=deploy.sh`
4. Check that Azure Configuration → General Settings has empty build commands

### Still seeing 30+ files?

1. The script should clean `wwwroot` first - check logs to see if cleaning step ran
2. Verify `DEPLOYMENT_TARGET` environment variable is set correctly
3. Check if Azure is running default deployment before our script

### Script not running?

1. Make sure `deploy.sh` has execute permissions (should be set automatically)
2. Check Azure logs for errors
3. Verify the script path in `.deployment` file matches your script name

## Manual Test (Local)

To test the deployment script locally:

```bash
# Set environment variables to simulate Azure
export DEPLOYMENT_SOURCE=$(pwd)
export DEPLOYMENT_TARGET=$(pwd)/wwwroot

# Run the deployment script
bash deploy.sh

# Check wwwroot
ls -la wwwroot/
# Should show: assets/, index.html, web.config
```

## Key Points

- ✅ `DEPLOYMENT_TARGET` is already `wwwroot` - don't create nested folders
- ✅ Clean `wwwroot` completely before copying
- ✅ Copy only 3 items: `assets/`, `index.html`, `web.config`
- ✅ Use `deploy.sh` as the main deployment script
- ✅ Leave Azure build commands empty - let the script handle everything

