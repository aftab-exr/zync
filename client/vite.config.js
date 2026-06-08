import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Production build optimizations
  build: {
    target: 'es2018',
    sourcemap: false,
    minify: 'esbuild',
    brotliSize: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('socket.io-client')) return 'socket';
            if (id.includes('react') || id.includes('zustand') || id.includes('react-router-dom') || id.includes('framer-motion') || id.includes('lucide-react')) return 'vendor';
            return 'vendor';
          }
        }
      }
    }
  }
})
