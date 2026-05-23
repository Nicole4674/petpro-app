import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Emits dist/version.json on every build so the in-app UpdateBanner can
    // detect when a new version has been deployed. Uses Vercel's auto-injected
    // git commit SHA when available (unique per deploy); falls back to a
    // build timestamp for local builds. The frontend polls this file every
    // few minutes and shows a "🎉 New update available — refresh" banner
    // when the version changes mid-session.
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        const version = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())
        const buildTime = new Date().toISOString()
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version, buildTime }, null, 2),
        })
      },
    },
  ],
})
