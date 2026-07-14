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
})
