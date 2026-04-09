import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 5000 },
  server: { port: 5173, strictPort: false },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  optimizeDeps: {
    include: ['fabric'],
  },
})
