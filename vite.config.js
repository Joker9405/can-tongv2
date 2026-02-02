import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Keep config minimal and stable.
// - Output dir stays as Vite default: dist (matches Vercel Output Directory)
// - Adds safe @ alias (won't affect you if not used)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
