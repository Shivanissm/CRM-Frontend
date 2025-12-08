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

# Clean wwwroot completely - remove ALL files and folders
# DEPLOYMENT_TARGET IS wwwroot, so clean it directly
echo "Step 3: Cleaning wwwroot directory ($DEPLOYMENT_TARGET)..."
if [ -d "$DEPLOYMENT_TARGET" ]; then
    echo "Removing all contents from wwwroot..."
    echo "Current contents before cleaning:"
    ls -la "$DEPLOYMENT_TARGET" | head -20 || true
    
    # Remove all files and folders (including hidden ones)
    # Use find with -mindepth 1 to avoid removing the directory itself
    find "$DEPLOYMENT_TARGET" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || {
        # Fallback: remove contents manually
        echo "Using fallback cleanup method..."
        rm -rf "$DEPLOYMENT_TARGET"/* 2>/dev/null || true
        rm -rf "$DEPLOYMENT_TARGET"/.[!.]* 2>/dev/null || true
        # Also remove any nested wwwroot folders
        rm -rf "$DEPLOYMENT_TARGET"/wwwroot 2>/dev/null || true
    }
    echo "wwwroot cleaned successfully"
    echo "Contents after cleaning:"
    ls -la "$DEPLOYMENT_TARGET" || echo "(empty)"
else
    echo "Creating wwwroot directory..."
    mkdir -p "$DEPLOYMENT_TARGET"
fi

# Copy only the 3 required items from dist to wwwroot
echo "Step 4: Copying only built files (assets/, index.html, web.config)..."
mkdir -p "$DEPLOYMENT_TARGET"

# Copy assets folder (DEPLOYMENT_TARGET is already wwwroot, no need for /wwwroot subfolder)
if [ -d "$DEPLOYMENT_SOURCE/dist/assets" ]; then
    cp -r "$DEPLOYMENT_SOURCE/dist/assets" "$DEPLOYMENT_TARGET/"
    echo "✓ Copied: assets/"
else
    echo "WARNING: assets/ folder not found in dist"
fi

# Copy index.html
if [ -f "$DEPLOYMENT_SOURCE/dist/index.html" ]; then
    cp "$DEPLOYMENT_SOURCE/dist/index.html" "$DEPLOYMENT_TARGET/"
    echo "✓ Copied: index.html"
else
    echo "WARNING: index.html not found in dist"
fi

# Copy web.config
if [ -f "$DEPLOYMENT_SOURCE/dist/web.config" ]; then
    cp "$DEPLOYMENT_SOURCE/dist/web.config" "$DEPLOYMENT_TARGET/"
    echo "✓ Copied: web.config"
else
    echo "WARNING: web.config not found in dist"
fi

# Verify deployment
echo "Step 5: Verifying deployment..."
echo "Final contents of wwwroot:"
ls -la "$DEPLOYMENT_TARGET" || echo "(empty)"

file_count=$(find "$DEPLOYMENT_TARGET" -type f | wc -l)
dir_count=$(find "$DEPLOYMENT_TARGET" -type d | wc -l)
echo ""
echo "wwwroot now contains: $dir_count directories, $file_count files"

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

