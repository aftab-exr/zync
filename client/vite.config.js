import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // ⚡ Phase 2.2: WebRTC Polyfills
    nodePolyfills({
      globals: {
        global: true,
        process: true,
        Buffer: true,
      },
    }),
    // ⚡ V2 HORIZON: The PWA Engine
    VitePWA({
      registerType: 'autoUpdate', // Automatically updates the app when you push new code
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons.svg'], 
      manifest: {
        name: 'Zync Intelligence',
        short_name: 'Zync',
        description: 'Zero-Knowledge Real-Time AI Terminal',
        // ⚡ Hardware Optimization: Pure black for OLED power saving on the Realme
        theme_color: '#000000', 
        background_color: '#000000',
        display: 'fullscreen', // Strips away the status bar, time, and battery indicators
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Cache all core application code
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // ⚡ Advanced: Intercept and cache incoming images from Cloudinary
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'zync-media-vault',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // Cache images for 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
});