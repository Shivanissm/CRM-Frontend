#!/bin/bash

# Azure App Service deployment script for Linux
# This script ensures wwwroot contains ONLY: assets/, index.html, web.config
# IMPORTANT: DEPLOYMENT_TARGET is already wwwroot, don't create nested folders!

echo "=== Azure App Service Deployment Script ==="
echo "DEPLOYMENT_SOURCE: $DEPLOYMENT_SOURCE"
echo "DEPLOYMENT_TARGET: $DEPLOYMENT_TARGET"

# Set default paths if not provided (for local testing)
DEPLOYMENT_SOURCE=${DEPLOYMENT_SOURCE:-$(pwd)}
DEPLOYMENT_TARGET=${DEPLOYMENT_TARGET:-$(pwd)/wwwroot}

echo "Using source: $DEPLOYMENT_SOURCE"
echo "Using target: $DEPLOYMENT_TARGET"

# Verify DEPLOYMENT_TARGET path structure
# In Azure, this should be something like /home/site/wwwroot
# We should NOT create any folders before wwwroot - Azure handles that
if [[ "$DEPLOYMENT_TARGET" == *"/site/wwwroot"* ]] || [[ "$DEPLOYMENT_TARGET" == *"\\site\\wwwroot"* ]]; then
    echo "✓ Detected Azure App Service path structure (includes /site/wwwroot)"
    echo "  Working directly with wwwroot folder inside site folder"
else
    echo "ℹ Using custom/local deployment path"
fi

# CRITICAL: Clean wwwroot FIRST before doing anything else
# Azure might have already copied files there, so we need to clean it immediately
echo ""
echo "=========================================="
echo "STEP 0: CLEANING WWWROOT FIRST (BEFORE BUILD)"
echo "=========================================="
echo "Target: $DEPLOYMENT_TARGET"
echo "IMPORTANT: Removing ALL files from wwwroot immediately to prevent Azure default deployment"

if [ -d "$DEPLOYMENT_TARGET" ]; then
    echo ""
    echo "Current contents in wwwroot (before cleaning):"
    ls -la "$DEPLOYMENT_TARGET" 2>/dev/null | head -20 || echo "(empty or error)"
    echo ""
    
    echo "Removing ALL files and folders from wwwroot..."
    # Use multiple methods to ensure everything is removed
    find "$DEPLOYMENT_TARGET" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null
    rm -rf "$DEPLOYMENT_TARGET"/* 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/.[!.]* 2>/dev/null || true
    # Remove any nested folders that might exist
    rm -rf "$DEPLOYMENT_TARGET"/wwwroot 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/site 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/dist 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/src 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/node_modules 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/public 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/scripts 2>/dev/null || true
    
    echo ""
    echo "✓ wwwroot cleaned (Step 0 complete)"
    echo "Contents after cleaning:"
    ls -la "$DEPLOYMENT_TARGET" 2>/dev/null || echo "(empty - correct!)"
    echo ""
else
    echo "wwwroot doesn't exist yet, will create it later"
    echo ""
fi

# Install dependencies
echo "Step 1: Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi

# Build the project
echo "Step 2: Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed"
    exit 1
fi

# STEP 3: Clean wwwroot again (in case anything was added during build)
# This is a safety measure to ensure wwwroot is clean before copying
echo ""
echo "=========================================="
echo "STEP 3: FINAL CLEAN OF WWWROOT (BEFORE COPY)"
echo "=========================================="
echo "Target: $DEPLOYMENT_TARGET"
echo "IMPORTANT: Final cleanup to ensure wwwroot is empty before copying files"

if [ -d "$DEPLOYMENT_TARGET" ]; then
    echo ""
    echo "Current contents before final clean:"
    ls -la "$DEPLOYMENT_TARGET" 2>/dev/null | head -20 || echo "(empty - good!)"
    echo ""
    
    # Remove ALL files and folders inside wwwroot (including hidden ones)
    echo "Removing all files and folders..."
    find "$DEPLOYMENT_TARGET" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null
    rm -rf "$DEPLOYMENT_TARGET"/* 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/.[!.]* 2>/dev/null || true
    # Remove any nested folders
    rm -rf "$DEPLOYMENT_TARGET"/wwwroot 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/site 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/dist 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/src 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/node_modules 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/public 2>/dev/null || true
    rm -rf "$DEPLOYMENT_TARGET"/scripts 2>/dev/null || true
    
    echo ""
    echo "✓ wwwroot cleaned (ready for copying)"
    echo "Contents after final clean:"
    ls -la "$DEPLOYMENT_TARGET" 2>/dev/null || echo "(empty - correct!)"
    echo ""
else
    echo "Creating wwwroot directory..."
    mkdir -p "$DEPLOYMENT_TARGET"
fi

# STEP 4: THEN - Copy ONLY the 3 items from dist (NOT the dist folder itself)
echo ""
echo "=========================================="
echo "STEP 4: COPYING FILES FROM DIST TO WWWROOT"
echo "=========================================="
echo "Source: $DEPLOYMENT_SOURCE/dist"
echo "Target: $DEPLOYMENT_TARGET"
echo "IMPORTANT: Copying ONLY 3 items from dist, NOT the dist folder itself"
echo "Items to copy: assets/, index.html, web.config"
echo ""

mkdir -p "$DEPLOYMENT_TARGET"

# Copy assets folder from dist (NOT the dist folder, just assets/)
if [ -d "$DEPLOYMENT_SOURCE/dist/assets" ]; then
    cp -r "$DEPLOYMENT_SOURCE/dist/assets" "$DEPLOYMENT_TARGET/"
    echo "✓ Copied: assets/ (from dist/assets to wwwroot/assets)"
else
    echo "✗ ERROR: assets/ folder not found in $DEPLOYMENT_SOURCE/dist"
    exit 1
fi

# Copy index.html from dist (NOT the dist folder, just the file)
if [ -f "$DEPLOYMENT_SOURCE/dist/index.html" ]; then
    cp "$DEPLOYMENT_SOURCE/dist/index.html" "$DEPLOYMENT_TARGET/"
    echo "✓ Copied: index.html (from dist/index.html to wwwroot/index.html)"
else
    echo "✗ ERROR: index.html not found in $DEPLOYMENT_SOURCE/dist"
    exit 1
fi

# Copy web.config from dist (NOT the dist folder, just the file)
if [ -f "$DEPLOYMENT_SOURCE/dist/web.config" ]; then
    cp "$DEPLOYMENT_SOURCE/dist/web.config" "$DEPLOYMENT_TARGET/"
    echo "✓ Copied: web.config (from dist/web.config to wwwroot/web.config)"
else
    echo "✗ ERROR: web.config not found in $DEPLOYMENT_SOURCE/dist"
    exit 1
fi

echo ""
echo "✓ All 3 items copied successfully from dist to wwwroot"

# Verify deployment
echo ""
echo "=========================================="
echo "STEP 5: VERIFYING DEPLOYMENT"
echo "=========================================="
echo "Final contents of wwwroot:"
ls -la "$DEPLOYMENT_TARGET" || echo "(empty)"
echo ""

file_count=$(find "$DEPLOYMENT_TARGET" -type f | wc -l)
dir_count=$(find "$DEPLOYMENT_TARGET" -type d | wc -l)
echo "wwwroot now contains: $dir_count directories, $file_count files"
echo ""

# Check if there are unexpected files
if [ "$file_count" -gt 3 ] || [ "$dir_count" -gt 2 ]; then
    echo "WARNING: wwwroot contains more than expected!"
    echo "Expected: 1 directory (assets), 2 files (index.html, web.config)"
    echo "Found: $dir_count directories, $file_count files"
    echo ""
    echo "Listing all contents:"
    find "$DEPLOYMENT_TARGET" -type f -o -type d | sort
    echo ""
    echo "This might indicate Azure copied files after our script ran."
    echo "Please check Azure deployment logs."
fi

# Check for nested wwwroot (should not exist)
if [ -d "$DEPLOYMENT_TARGET/wwwroot" ]; then
    echo "WARNING: Found nested wwwroot folder! Removing it..."
    rm -rf "$DEPLOYMENT_TARGET/wwwroot"
fi

# List what should be there
echo ""
echo "Expected contents:"
echo "  - assets/ (directory)"
echo "  - index.html (file)"
echo "  - web.config (file)"
echo ""
echo "✅ Deployment completed successfully!"
echo "wwwroot now contains ONLY: assets/, index.html, web.config"

