import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        // ⚡ THE FIX: We removed 'global: true' because it overwrites the native Android 'window' object and crashes Capacitor.
        process: true,
        Buffer: true,
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons.svg'], 
      manifest: {
        name: 'Zync Intelligence',
        short_name: 'Zync',
        description: 'Zero-Knowledge Real-Time AI Terminal',
        theme_color: '#000000', 
        background_color: '#000000',
        display: 'fullscreen',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'zync-media-vault',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  // ⚡ THE FIX: Force Vite to compile the JavaScript for older mobile WebViews
  build: {
    target: 'es2015',
    chunkSizeWarningLimit: 1500,
  }
});