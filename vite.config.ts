import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createApiMiddleware } from './server/middleware.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'api-proxy',
        configureServer(server) {
          server.middlewares.use(createApiMiddleware(env, { isProduction: false }))
        },
        configurePreviewServer(server) {
          server.middlewares.use(createApiMiddleware(env, { isProduction }))
        },
      },
    ],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    server: {
      host: true,
      port: Number(env.PORT) || 5173,
      strictPort: false,
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  }
})
