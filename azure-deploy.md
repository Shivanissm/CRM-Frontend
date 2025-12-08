# Azure App Service Deployment Configuration

This project is configured to automatically deploy to Azure App Service when code is merged to the main branch.

## How It Works

When code is pushed to main, Azure App Service automatically:
1. Runs `npm install`
2. Runs the build command
3. **Automatically builds directly to `wwwroot`** (no manual copying needed!)

## Solution Overview

The deployment process:
1. Builds to `dist` folder (standard Vite output)
2. **Automatically cleans `wwwroot`** (removes all 29+ files/folders)
3. **Copies only 3 items** from `dist` to `wwwroot`:
   - `assets/` folder (contains JS and CSS files)
   - `index.html`
   - `web.config`

This ensures `wwwroot` contains ONLY the built files, not the entire repository.

## Configuration Files

- **`vite.config.ts`**: Automatically detects Azure environment and outputs to `wwwroot`
- **`package.json`**: Contains build scripts
- **`deploy.sh`** / **`deploy.cmd`**: Alternative deployment scripts (if needed)

## Azure App Service Configuration

### Azure App Service Configuration

In Azure Portal → **Configuration** → **General Settings**:

1. **Build Command**: `npm run build`
2. **Post Build Command**: `npm run deploy` (this cleans wwwroot and copies only built files)
3. **Output Directory**: Leave empty (deployment script handles this)
4. **Node Version**: Match your local development version

The deployment process:
- Builds to `dist` folder
- Runs `npm run deploy` which:
  - **Cleans wwwroot completely** (removes all files/folders)
  - **Copies only**: `assets/`, `index.html`, `web.config`
  - Ensures wwwroot has exactly 3 items (not 29+)

### Option 2: Use Custom Deployment Script

If automatic detection doesn't work, you can use the deployment scripts:

1. In Azure Portal → **Configuration** → **General Settings**
2. **Build Command**: Leave empty or set to `npm run build`
3. Azure will automatically use `deploy.sh` (Linux) or `deploy.cmd` (Windows) if present

## What Gets Deployed

**Only these 3 items are copied to wwwroot:**
1. `assets/` folder (contains all JS and CSS files)
2. `index.html` (main HTML file)
3. `web.config` (IIS configuration)

**Everything else is removed from wwwroot** before copying, ensuring a clean deployment.

## Testing Locally

To test the Azure build locally:

```bash
# Simulate Azure build (outputs to wwwroot)
npm run build:azure

# Normal local build (outputs to dist)
npm run build
```

## Troubleshooting

### Files not appearing in wwwroot:

1. **Check build logs** in Azure Portal → Deployment Center → Logs
2. **Verify build command** in Configuration → General Settings
3. **Check Node.js version** matches your package.json
4. **Verify environment detection** - check if `WEBSITE_SITE_NAME` is set in Azure

### Build fails:

1. Check Azure App Service logs for specific errors
2. Verify all dependencies are in `package.json` (not just devDependencies)
3. Ensure Node.js version is compatible
4. Check that TypeScript compilation succeeds

### Manual verification:

If you need to manually verify the build:

```bash
# Build for Azure
AZURE_APP_SERVICE=true npm run build

# Check if wwwroot was created
ls -la wwwroot/
```

## What Happens During Deployment

1. Azure detects code push to main branch
2. Azure runs `npm install`
3. Azure runs `npm run build` → builds to `dist` folder
4. Azure runs `npm run deploy` → deployment script:
   - **Cleans wwwroot** (removes all existing files/folders)
   - **Copies only 3 items** from `dist` to `wwwroot`:
     - `assets/` folder
     - `index.html`
     - `web.config`
5. Azure serves files from `wwwroot`
6. ✅ Done! wwwroot now contains only the 3 built files, not 29+ items.

