import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig, loadEnv } from 'vite'

// The internal library reads its Drive credential + DRIVE_FOLDER_ID from the
// Worker `env` bindings (see src/lib/drive.ts). The credential is preferably
// GOOGLE_SERVICE_ACCOUNT_JSON (a Service Account key — required for PRIVATE
// Drive files), with GOOGLE_API_KEY kept only as a fallback. For the Vite dev
// server we load them from `.env` (via Vite's loadEnv) and inject them into the
// Cloudflare dev adapter's bindings, so the code reads the Drive config from
// `.env` and works out of the box with no manual step. `wrangler pages dev`
// reads the same values from `.dev.vars` (kept in sync from `.env` by
// scripts/sync-env.mjs). These values stay server-side and are NEVER sent to
// the browser and never logged.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const bindings: Record<string, string> = {}
  for (const key of [
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_API_KEY',
    'DRIVE_FOLDER_ID',
    'SECONDARY_DRIVE_FOLDER_ID',
    'SITE_ORIGIN',
    'SESSION_SECRET',
    'ADMIN_SEED_EMAIL',
    'ADMIN_SEED_PASSWORD',
  ]) {
    if (env[key]) bindings[key] = env[key]
  }

  return {
    plugins: [
      build(),
      devServer({
        // The Cloudflare adapter is a factory: pass the `.env`-sourced values
        // as extra bindings, merged on top of the Cloudflare proxy's own
        // bindings (.dev.vars / wrangler.jsonc vars).
        adapter: adapter({ env: bindings }),
        entry: 'src/index.tsx'
      })
    ]
  }
})
