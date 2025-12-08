import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Check if we're in Azure App Service (wwwroot exists or SCM_DO_BUILD_DURING_DEPLOYMENT is set)
const isAzure = process.env.SCM_DO_BUILD_DURING_DEPLOYMENT === 'true' || 
                process.env.WEBSITE_SITE_NAME !== undefined ||
                process.env.AZURE_APP_SERVICE === 'true';

// Use wwwroot for Azure deployments, dist for local development
const outDir = isAzure ? 'wwwroot' : 'dist';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: outDir,
    assetsDir: 'assets',
    // Ensure proper MIME types for module scripts
    rollupOptions: {
      output: {
        // Ensure proper file extensions
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
})

