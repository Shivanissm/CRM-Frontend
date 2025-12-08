#!/bin/bash

# Azure App Service deployment script for Linux
# This script ensures wwwroot contains ONLY: assets/, index.html, web.config

echo "=== Azure App Service Deployment Script ==="

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
echo "Step 3: Cleaning wwwroot directory..."
if [ -d "$DEPLOYMENT_TARGET/wwwroot" ]; then
    echo "Removing all contents from wwwroot..."
    # Remove all files and folders (including hidden ones)
    find "$DEPLOYMENT_TARGET/wwwroot" -mindepth 1 -delete 2>/dev/null || {
        # Fallback: remove contents manually
        rm -rf "$DEPLOYMENT_TARGET/wwwroot"/* 2>/dev/null
        rm -rf "$DEPLOYMENT_TARGET/wwwroot"/.[!.]* 2>/dev/null
    }
    echo "wwwroot cleaned successfully"
else
    echo "Creating wwwroot directory..."
    mkdir -p "$DEPLOYMENT_TARGET/wwwroot"
fi

# Copy only the 3 required items from dist to wwwroot
echo "Step 4: Copying only built files (assets/, index.html, web.config)..."
mkdir -p "$DEPLOYMENT_TARGET/wwwroot"

# Copy assets folder
if [ -d "$DEPLOYMENT_SOURCE/dist/assets" ]; then
    cp -r "$DEPLOYMENT_SOURCE/dist/assets" "$DEPLOYMENT_TARGET/wwwroot/"
    echo "✓ Copied: assets/"
else
    echo "WARNING: assets/ folder not found in dist"
fi

# Copy index.html
if [ -f "$DEPLOYMENT_SOURCE/dist/index.html" ]; then
    cp "$DEPLOYMENT_SOURCE/dist/index.html" "$DEPLOYMENT_TARGET/wwwroot/"
    echo "✓ Copied: index.html"
else
    echo "WARNING: index.html not found in dist"
fi

# Copy web.config
if [ -f "$DEPLOYMENT_SOURCE/dist/web.config" ]; then
    cp "$DEPLOYMENT_SOURCE/dist/web.config" "$DEPLOYMENT_TARGET/wwwroot/"
    echo "✓ Copied: web.config"
else
    echo "WARNING: web.config not found in dist"
fi

# Verify deployment
echo "Step 5: Verifying deployment..."
file_count=$(find "$DEPLOYMENT_TARGET/wwwroot" -type f | wc -l)
dir_count=$(find "$DEPLOYMENT_TARGET/wwwroot" -type d | wc -l)
echo "wwwroot now contains: $dir_count directories, $file_count files"

echo ""
echo "✅ Deployment completed successfully!"
echo "wwwroot now contains ONLY: assets/, index.html, web.config"

