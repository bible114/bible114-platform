import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildId = new Date().toISOString()
  .replace('T', '-')
  .slice(0, 16)
  .replace(':', '')

const buildIdPlugin = () => ({
  name: 'bible114-build-id',
  transformIndexHtml(html) {
    return html.replaceAll('%BUILD_ID%', buildId)
  },
})

export default defineConfig({
  plugins: [react(), buildIdPlugin()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/src/data/items/') ||
            id.endsWith('/src/data/shop_items.js')
          ) {
            return 'app-catalog'
          }

          if (
            id.endsWith('/src/data/read_schedules.json') ||
            id.endsWith('/src/data/sequential_schedule.json')
          ) {
            return 'app-schedules'
          }

          if (!id.includes('/node_modules/')) return undefined

          if (
            id.includes('/firebase/compat/firestore/') ||
            id.includes('/@firebase/firestore') ||
            id.includes('/@firebase/webchannel-wrapper/')
          ) {
            return 'vendor-firebase-firestore'
          }

          if (
            id.includes('/firebase/compat/auth/') ||
            id.includes('/@firebase/auth')
          ) {
            return 'vendor-firebase-auth'
          }

          if (
            id.includes('/firebase/') ||
            id.includes('/@firebase/')
          ) {
            return 'vendor-firebase-core'
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react'
          }

          if (
            id.includes('/qrcode/') ||
            id.includes('/dijkstrajs/') ||
            id.includes('/encode-utf8/')
          ) {
            return 'vendor-qrcode'
          }

          return 'vendor'
        },
      },
    },
  },
})
