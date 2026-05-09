import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Codespaces / containers: listen on all interfaces so port forwarding works
    host: true,
    port: 5173,
    proxy: {
      // Browser must not use localhost:8000 in Codespaces (that is the user's PC).
      // Same-origin requests hit Vite; these paths forward to FastAPI in the container.
      '/latest-traffic': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/predict': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/docs': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/openapi.json': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/redoc': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
