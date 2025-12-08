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

  console.log('Step 1: Cleaning wwwroot directory...');
  // Remove all existing files in wwwroot
  if (existsSync(wwwrootDir)) {
    removeDirectoryContents(wwwrootDir);
  } else {
    // Create wwwroot if it doesn't exist
    mkdirSync(wwwrootDir, { recursive: true });
    console.log('Created wwwroot directory');
  }

  console.log('\nStep 2: Copying only built files (assets, index.html, web.config) to wwwroot...');
  // Copy only the specific built files from dist to wwwroot
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

