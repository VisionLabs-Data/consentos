import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

/**
 * Vite plugin that provides a no-op ``virtual:ee-extensions`` module.
 *
 * In the cloud repo this plugin is replaced with one that points to
 * the real EE register module.  In the OSS repo the virtual module
 * simply exports nothing, making ``discoverExtensions()`` a no-op.
 */
function eeExtensions() {
  const virtualModuleId = 'virtual:ee-extensions'
  const resolvedId = '\0' + virtualModuleId

  return {
    name: 'ee-extensions',
    resolveId(id: string) {
      if (id === virtualModuleId) return resolvedId
    },
    load(id: string) {
      if (id === resolvedId) return 'export default undefined;'
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), eeExtensions()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
