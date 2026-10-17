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
      rolldownOptions: {
        output: {
          // Bibliotecas em pacotes próprios: o navegador guarda cada um em cache e só rebaixa o que mudou.
          codeSplitting: {
            groups: [
              { name: 'vendor-charts', test: /node_modules[\/](recharts|d3-[^\/]+|victory-vendor|internmap|decimal.js-light|immer|reselect|redux|@reduxjs)[\/]/, priority: 30 },
              { name: 'vendor-query', test: /node_modules[\/]@tanstack[\/]/, priority: 20 },
              { name: 'vendor-react', test: /node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler|zustand)[\/]/, priority: 10 },
            ],
          },
        },
      },
    },
  }
})
