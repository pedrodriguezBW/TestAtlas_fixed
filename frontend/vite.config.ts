import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [...configDefaults.exclude, 'server/**'],
  },
  server: {
    port: 18000,
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://127.0.0.1:17000',
        changeOrigin: true,
      },
    },
  },
})
