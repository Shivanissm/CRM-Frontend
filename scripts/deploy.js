import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const distDir = join(projectRoot, 'dist');

// For Azure App Service, use DEPLOYMENT_TARGET (which is wwwroot)
// For local deployment, use project root wwwroot
// IMPORTANT: Never create nested wwwroot folders
const isAzure = process.env.DEPLOYMENT_TARGET !== undefined || 
                process.env.WEBSITE_SITE_NAME !== undefined;

const wwwrootDir = isAzure 
  ? (process.env.DEPLOYMENT_TARGET || '/home/site/wwwroot')
  : join(projectRoot, 'wwwroot');

console.log(`Deployment target: ${wwwrootDir}`);
console.log(`Is Azure: ${isAzure}`);

// Verify path structure for Azure
if (isAzure && wwwrootDir.includes('/site/wwwroot')) {
  console.log('✓ Detected Azure App Service path structure (includes /site/wwwroot)');
  console.log('  Working directly with wwwroot folder inside site folder');
  console.log('  IMPORTANT: Only cleaning wwwroot, NOT touching site folder');
}

// Function to copy specific files/folders from dist to wwwroot
function copyBuiltFiles(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  // Only copy these specific items: assets folder, index.html, web.config
  const itemsToCopy = ['assets', 'index.html', 'web.config'];
  
  for (const item of itemsToCopy) {
    const srcPath = join(src, item);
    const destPath = join(dest, item);
    
    if (!existsSync(srcPath)) {
      console.warn(`Warning: ${item} not found in dist, skipping...`);
      continue;
    }
    
    const stat = statSync(srcPath);
    
    if (stat.isDirectory()) {
      // Copy directory recursively
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      copyDirectoryRecursive(srcPath, destPath);
      console.log(`Copied directory: ${item}/`);
    } else {
      // Copy file
      copyFileSync(srcPath, destPath);
      console.log(`Copied file: ${item}`);
    }
  }
}

// Helper function to copy directory recursively
function copyDirectoryRecursive(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Function to remove directory contents
function removeDirectoryContents(dir) {
  if (!existsSync(dir)) {
    return;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      rmSync(entryPath, { recursive: true, force: true });
      console.log(`Removed directory: ${entry.name}`);
    } else {
      rmSync(entryPath, { force: true });
      console.log(`Removed file: ${entry.name}`);
    }
  }
}

// Main deployment function
function deploy() {
  console.log('Starting deployment...\n');

  // Check if dist directory exists
  if (!existsSync(distDir)) {
    console.error('Error: dist directory does not exist. Please run "npm run build" first.');
    process.exit(1);
  }

  // Check if dist directory is empty
  const distContents = readdirSync(distDir);
  if (distContents.length === 0) {
    console.error('Error: dist directory is empty. Please run "npm run build" first.');
    process.exit(1);
  }

  console.log('\n==========================================');
  console.log('STEP 1: REMOVING ALL FILES FROM WWWROOT');
  console.log('==========================================');
  console.log(`Target path: ${wwwrootDir}`);
  console.log('IMPORTANT: Removing EVERYTHING inside wwwroot first');
  console.log('IMPORTANT: NOT touching site folder or parent directories');
  
  // FIRST: Remove ALL existing files and folders in wwwroot
  // Note: wwwrootDir is the full path (e.g., /home/site/wwwroot)
  // We only clean wwwroot, never touch the site folder
  if (existsSync(wwwrootDir)) {
    const contentsBefore = readdirSync(wwwrootDir);
    console.log(`\nCurrent contents BEFORE cleaning (${contentsBefore.length} items):`);
    contentsBefore.forEach(item => console.log(`  - ${item}`));
    
    removeDirectoryContents(wwwrootDir);
    
    const contentsAfter = readdirSync(wwwrootDir);
    console.log(`\n✓ wwwroot cleaned successfully (${contentsAfter.length} items remaining)`);
    if (contentsAfter.length > 0) {
      console.log('WARNING: Some items remain after cleaning!');
      contentsAfter.forEach(item => console.log(`  - ${item}`));
    } else {
      console.log('✓ wwwroot is now empty (correct!)');
    }
  } else {
    // Create wwwroot if it doesn't exist (mkdir -p will create parent directories if needed)
    // But in Azure, wwwroot should already exist
    mkdirSync(wwwrootDir, { recursive: true });
    console.log('Created wwwroot directory');
  }

  console.log('\n==========================================');
  console.log('STEP 2: COPYING FILES FROM DIST TO WWWROOT');
  console.log('==========================================');
  console.log(`Source: ${distDir}`);
  console.log(`Target: ${wwwrootDir}`);
  console.log('IMPORTANT: Copying ONLY 3 items from dist, NOT the dist folder itself');
  console.log('Items to copy: assets/, index.html, web.config\n');
  
  // THEN: Copy only the specific built files from dist to wwwroot
  // We copy the CONTENTS of dist, not the dist folder itself
  copyBuiltFiles(distDir, wwwrootDir);

  console.log('\n✅ Deployment completed successfully!');
  console.log(`Files have been copied from ${distDir} to ${wwwrootDir}`);
}

// Run deployment
try {
  deploy();
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}

