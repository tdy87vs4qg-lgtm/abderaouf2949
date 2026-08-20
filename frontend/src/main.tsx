/* ── Typography ───────────────────────────────────────────────────────────
   ONE Arabic family for the entire interface: IBM Plex Sans Arabic. It is a
   modern, low-contrast humanist grotesque — the quietest, most "Scandinavian"
   Arabic face available as a self-hosted webfont — and it carries a matching
   Latin, so numerals and the odd Latin word never break the voice.

   Self-hosted through @fontsource (no third-party request, no FOUT from an
   external stylesheet), weights 300–600 only: quiet luxury never shouts, so
   the heavy 700+ display weights are deliberately not loaded. `font-synthesis:
   none` in styles.css guarantees the browser never fakes a weight either. */
import '@fontsource/ibm-plex-sans-arabic/300.css'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './components/ThemeProvider'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
