import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The exterior (تيسير) React SPA is built as a set of static assets that are
// served by the Hono backbone. All hashed JS/CSS/asset files live under
// `/react/` (so they never collide with the internal library's `/static/`
// assets), while the SPA's `index.html` is emitted to `public/react/index.html`
// and hand-served by the Hono server for the public routes
// (`/`, `/login`, `/signup`, `/subscription`).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Assets are requested from /react/... at runtime.
  base: '/react/',
  build: {
    // Emit straight into the Hono project's public dir so `vite build` (server)
    // copies it into dist/ automatically.
    outDir: '../public/react',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    // Keep Framer Motion OFF the first-paint critical path. It is imported
    // lazily (see src/lib/lazyMotion.tsx) and only needed once the app has
    // painted, so we strip its <link rel="modulepreload"> hint — otherwise the
    // browser would eagerly fetch the ~190 kB animation chunk during boot,
    // exactly the delay we are eliminating. React vendor + runtime stay
    // preloaded because they ARE on the critical path.
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !dep.includes('framer-motion'))
      },
    },
    rollupOptions: {
      output: {
        // Split heavy third-party libraries into their own long-term-cacheable
        // chunks. Framer Motion (the biggest animation dependency) is isolated
        // so it can be fetched in parallel with — and cached independently of —
        // the app code, keeping the first-paint critical path small.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) {
            return 'framer-motion'
          }
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/') || id.includes('scheduler')) {
            return 'react-vendor'
          }
          if (id.includes('lucide-react')) {
            return 'icons'
          }
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
})
