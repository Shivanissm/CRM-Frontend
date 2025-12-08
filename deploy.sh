#!/bin/bash

# Azure App Service deployment script for Linux

echo "Handling Node.js deployment..."

# Install dependencies
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Failed to install dependencies"
    exit 1
fi

# Build the project
echo "Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "Build failed"
    exit 1
fi

# Deploy to wwwroot
echo "Deploying to wwwroot..."
if [ -d "$DEPLOYMENT_TARGET/wwwroot" ]; then
    echo "Cleaning wwwroot..."
    rm -rf "$DEPLOYMENT_TARGET/wwwroot"
fi

mkdir -p "$DEPLOYMENT_TARGET/wwwroot"
cp -r "$DEPLOYMENT_SOURCE/dist/"* "$DEPLOYMENT_TARGET/wwwroot/"

if [ $? -ne 0 ]; then
    echo "Deployment failed"
    exit 1
fi

echo "Deployment completed successfully!"

