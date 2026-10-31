import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev only: proxy archflux-api paths so `npm run dev` is same-origin
// (SERVICES_SPEC §3.3). Production builds have no proxy — see /config.json.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const target = env.VITE_DEV_API_PROXY || 'http://localhost:3001'
  const proxied = { target, changeOrigin: false }
  return {
    plugins: [react()],
    base: '/',
    server: {
      proxy: {
        '/api': proxied,
        '/oauth2': proxied,
        '/login/oauth2': proxied,
        '/ws': { ...proxied, ws: true },
      },
    },
    build: {
      minify: 'esbuild',
      sourcemap: false,
      target: 'es2023',
      cssMinify: 'esbuild',
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
    },
  }
})
