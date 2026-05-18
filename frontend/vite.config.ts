import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
if (id.includes('date-fns'))
              return 'vendor-data'
            if (id.includes('@codemirror') || id.includes('codemirror') || id.includes('@lezer') || id.includes('@uiw/'))
              return 'vendor-editor'
            if (id.includes('react-router'))
              return 'vendor-router'
          }
          if (id.includes('/pages/')) {
            const name = id.split('/pages/')[1].split('/')[0]
            if (
              id.includes('@codemirror') || id.includes('codemirror') || id.includes('@uiw/') ||
              id.includes('recharts') || id.includes('@tanstack/react-table') || id.includes('@tanstack/react-virtual')
            ) return undefined
            return `page-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
          }
        },
      },
    },
    chunkSizeWarningLimit: 550,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
