import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const distDir = join(projectRoot, 'dist');
// For Azure App Service, wwwroot might be in a different location
// Check environment variable first, then fall back to project root
const wwwrootPath = process.env.AZURE_WWWROOT_PATH || 
                    process.env.WWWROOT_PATH || 
                    join(projectRoot, 'wwwroot');
const wwwrootDir = wwwrootPath;

// Function to copy directory recursively
function copyRecursive(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      console.log(`Copied: ${entry.name}`);
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

  console.log('\nStep 2: Copying files from dist to wwwroot...');
  // Copy all files from dist to wwwroot
  copyRecursive(distDir, wwwrootDir);

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

