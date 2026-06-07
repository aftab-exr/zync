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
    brotliSize: true
  }
})
