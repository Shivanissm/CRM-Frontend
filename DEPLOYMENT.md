# Deployment Guide

## MIME Type Error Fix

If you're getting the error:
```
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"
```

This means your server is returning HTML (usually a 404 page) instead of the JavaScript files, or the server isn't configured to serve static files correctly.

## Server Configuration

### Nginx Configuration

Add this to your Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/your/dist;
    index index.html;

    # Serve static files with correct MIME types
    location ~* \.(js|mjs|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        add_header Content-Type application/javascript;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Specifically handle JavaScript modules
    location ~* \.(js|mjs)$ {
        add_header Content-Type application/javascript;
        add_header Access-Control-Allow-Origin *;
    }

    # Handle all routes - serve index.html for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy (if needed)
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Apache Configuration

Add this to your `.htaccess` file in the `dist` directory:

```apache
# Enable rewrite engine
RewriteEngine On

# Set correct MIME types
AddType application/javascript .js
AddType application/javascript .mjs
AddType text/css .css

# Serve index.html for all routes (client-side routing)
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# Cache static assets
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/jpg "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType image/gif "access plus 1 year"
    ExpiresByType image/svg+xml "access plus 1 year"
</IfModule>
```

### Node.js/Express Server

If using Express to serve the static files:

```javascript
const express = require('express');
const path = require('path');
const app = express();

// Serve static files with correct MIME types
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Handle client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Build Configuration

Make sure your `vite.config.ts` is set up correctly:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Ensure proper chunking
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
})
```

## Verification Steps

1. **Check build output**: After running `npm run build`, verify that the `dist` folder contains:
   - `index.html`
   - `assets/` folder with `.js` and `.css` files

2. **Check file paths**: Open `dist/index.html` and verify the script tags point to the correct paths (should be `/assets/...`)

3. **Test locally**: Run `npm run preview` to test the production build locally

4. **Check server logs**: When accessing the deployed app, check server logs to see what files are being requested and what's being returned

5. **Browser DevTools**: 
   - Open Network tab
   - Look for failed requests (red)
   - Check the Response tab - if you see HTML instead of JavaScript, the server is returning the wrong file

## Common Issues

1. **404 errors**: The server can't find the JS files - check file paths and server root directory
2. **Wrong MIME type**: Server is serving JS files as `text/html` - add MIME type configuration
3. **Base path issues**: If app is deployed in a subdirectory, you may need to set `base` in `vite.config.ts`
4. **Caching**: Old cached files might cause issues - clear browser cache or add cache-busting

## If Deployed in Subdirectory

If your app is deployed at `https://example.com/app/` instead of `https://example.com/`, update `vite.config.ts`:

```typescript
export default defineConfig({
  base: '/app/',
  // ... rest of config
})
```

Then rebuild: `npm run build`
