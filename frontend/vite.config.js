import path from "path"
import { fileURLToPath } from 'url'
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = env.VITE_BASE_PATH || '/'

  return {
    base: basePath,
    plugins: [
      react({
        // Enable Fast Refresh for React 19
        fastRefresh: true,
        // Ensure JSX is properly handled
        jsxRuntime: 'automatic'
      }),
      tailwindcss()
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },
    esbuild: {
      loader: 'tsx',
      include: /src\/.*\.[tj]sx?$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
    // Explicit HMR configuration
    server: {
      // Bind to all interfaces, not just 127.0.0.1 - backend runs inside
      // WSL and needs to reach this dev server for its startup health
      // check (backend/main.py); WSL-to-Windows loopback forwarding for a
      // 127.0.0.1-only listener isn't reliable in every environment.
      host: true,
      hmr: {
        overlay: true
      },
      watch: {
        usePolling: false
      },
      proxy: {
        '/ollama': {
          target: 'http://localhost:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, '')
        },
        //might comment out when done with local | enable when working locally
        '/dms/es': {
          target: 'http://localhost:9200',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/dms\/es/, '')
        },
        '/dms/pygeoapi': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/dms\/pygeoapi/, '')
        },
        '/dms': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/dms/, '/api')
        },
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true
        }
        //till here when done with local
      }
    }
  }
})