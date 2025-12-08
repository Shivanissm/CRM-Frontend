# Azure App Service Deployment Configuration

This project is configured to automatically deploy to Azure App Service when code is merged to the main branch.

## How It Works

When code is pushed to main, Azure App Service automatically:
1. Runs `npm install`
2. Runs the build command
3. **Automatically builds directly to `wwwroot`** (no manual copying needed!)

## Solution Overview

The `vite.config.ts` automatically detects when it's running in Azure App Service and builds directly to the `wwwroot` folder instead of `dist`. This means:
- ✅ No manual file copying needed
- ✅ No need to delete old files
- ✅ Everything happens automatically during deployment

## Configuration Files

- **`vite.config.ts`**: Automatically detects Azure environment and outputs to `wwwroot`
- **`package.json`**: Contains build scripts
- **`deploy.sh`** / **`deploy.cmd`**: Alternative deployment scripts (if needed)

## Azure App Service Configuration

### Option 1: Automatic Detection (Recommended - Already Configured!)

The build automatically detects Azure and outputs to `wwwroot`. Just ensure in Azure Portal:

1. Go to **Configuration** → **General Settings**
2. **Build Command**: `npm run build` (or leave default)
3. **Output Directory**: Leave empty or set to `wwwroot`
4. **Node Version**: Match your local development version

The `vite.config.ts` will automatically:
- Detect Azure environment variables
- Build directly to `wwwroot` folder
- Skip the `dist` folder entirely

### Option 2: Use Custom Deployment Script

If automatic detection doesn't work, you can use the deployment scripts:

1. In Azure Portal → **Configuration** → **General Settings**
2. **Build Command**: Leave empty or set to `npm run build`
3. Azure will automatically use `deploy.sh` (Linux) or `deploy.cmd` (Windows) if present

## Environment Detection

The build process automatically detects Azure App Service using:
- `SCM_DO_BUILD_DURING_DEPLOYMENT` environment variable
- `WEBSITE_SITE_NAME` environment variable  
- `AZURE_APP_SERVICE` environment variable

When detected, Vite builds directly to `wwwroot` instead of `dist`.

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
3. Azure runs `npm run build` (or your configured build command)
4. `vite.config.ts` detects Azure environment
5. Vite builds directly to `wwwroot` folder
6. Azure serves files from `wwwroot`
7. ✅ Done! No manual steps needed.

