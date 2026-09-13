// ============================================================================
// build-illustrations.mjs  —  PURELY COSMETIC ASSET PREP
//
// Normalises the illustration set shipped in Svg.zip onto the EXACT palette
// used by the finished visual prototype, so a single theme engine
// (public/static/illustrations.js + the --illu-* CSS custom properties) can
// recolour every illustration for light and dark mode.
//
// The prototype's own 13 SVGs already use the target palette:
//     #111111 outline · #222222 mid · #6C3EF4 accent · #EFD9CC skin
//     #F2F2F5 paper   · #E8E8EE paperAlt · #FFFFFF paperPure
//
// The remaining illustrations from Svg.zip are stock unDraw art drawn in
// unDraw's default palette (#6c63ff indigo, #2f2e41 slate, #e6e6e6 grey, …).
// This script rewrites those hexes to the prototype palette above. Nothing
// else about the artwork is altered — no geometry, no viewBox, no structure.
//
// THIS TOUCHES ONLY IMAGE FILES. It contains no application logic and is not
// part of the request/response path; it is a one-shot design-asset step whose
// output is committed to the repo.
//
//   run:  node scripts/build-illustrations.mjs
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Where the normalised illustrations land (served statically by the Pages
// asset layer, exactly like the other files under public/static/).
const OUT_DIR = resolve(root, 'public/static/illustrations')

// Source directory holding the raw Svg.zip artwork.
const SRC_DIR = resolve(root, 'design-src/illustrations')

/**
 * unDraw default palette  →  تيسير prototype palette.
 * Keys are lowercase; both 3- and 6-digit forms are handled.
 */
const RECOLOR = {
  // --- accent (purple) -----------------------------------------------------
  '#6c63ff': '#6C3EF4',
  '#6c63fe': '#6C3EF4',
  '#3f3d56': '#222222', // unDraw's dark slate → prototype "mid"
  '#2f2e41': '#111111', // unDraw's darkest → prototype "outline"
  '#090814': '#111111',
  '#1a1a1a': '#111111',
  '#000000': '#111111',
  '#000': '#111111',
  // --- pink/red accents collapse onto the single brand accent -------------
  '#ff6584': '#6C3EF4',
  '#f26674': '#6C3EF4',
  '#407bff': '#6C3EF4',
  '#a02724': '#6C3EF4',
  // --- skin tones ---------------------------------------------------------
  '#9f616a': '#EFD9CC',
  '#a0616a': '#EFD9CC',
  '#ed9da0': '#EFD9CC',
  '#ffb8b8': '#EFD9CC',
  '#ffb6b6': '#EFD9CC',
  '#b55b52': '#EFD9CC',
  '#b65b52': '#EFD9CC',
  // --- papers / greys -----------------------------------------------------
  '#f2f2f2': '#F2F2F5',
  '#fafafa': '#F2F2F5',
  '#f5f5f5': '#F2F2F5',
  '#f0f0f0': '#F2F2F5',
  '#e6e6e6': '#E8E8EE',
  '#e0e0e0': '#E8E8EE',
  '#ebebeb': '#E8E8EE',
  '#d6d6e3': '#E8E8EE',
  '#d0cde1': '#E8E8EE',
  '#cccccc': '#E8E8EE',
  '#ccc': '#E8E8EE',
  '#263238': '#111111',
  // --- pure white stays pure white ---------------------------------------
  '#ffffff': '#FFFFFF',
  '#fff': '#FFFFFF',
}

/**
 * Which raw files to normalise, and the friendly name each is published under.
 * Only the illustrations the redesign actually places are converted, so no
 * unused artwork is shipped to visitors.
 */
const JOBS = [
  // ── in-progress / downloading states ──────────────────────────────────
  ['undraw_file-searching_yska.svg', 'file-searching.svg'],
  ['undraw_the-search_cjxa.svg', 'the-search.svg'],
  ['undraw_file-search_cbur.svg', 'file-search.svg'],
  ['undraw_searching-everywhere_tffi.svg', 'searching-everywhere.svg'],
  // ── copy-link / share / "open in your browser" view ───────────────────
  ['undraw_mail-sent_dagx.svg', 'mail-sent.svg'],
  ['undraw_enter_nwx3.svg', 'enter.svg'],
  // ── supporting states ─────────────────────────────────────────────────
  ['undraw_connection-lost_am29.svg', 'connection-lost.svg'],
  ['undraw_search-engines_k649.svg', 'search-engines.svg'],
  ['undraw_forgot-password_nttj.svg', 'forgot-password.svg'],
  ['undraw_inspection_tyum.svg', 'inspection.svg'],
  ['undraw_books_wxzz.svg', 'books.svg'],
  ['undraw_fill-the-blank_n29z.svg', 'fill-the-blank.svg'],
]

/** Replace every recognised colour literal in an SVG source string. */
function recolor(svg, table) {
  return svg.replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => {
    const key = hex.toLowerCase()
    if (table[key]) return table[key]
    // Expand a 3-digit form and retry (e.g. #eee → #eeeeee).
    if (key.length === 4) {
      const long = '#' + key[1].repeat(2) + key[2].repeat(2) + key[3].repeat(2)
      if (table[long]) return table[long]
    }
    return hex
  })
}

// ---------------------------------------------------------------------------
// PER-THEME VARIANTS
//
// Most illustrations are inlined into the DOM at runtime and recoloured live by
// CSS custom properties (see public/static/illustrations.js). But a few slots
// must be filled WITHOUT touching the JavaScript that renders them — most
// importantly the library viewer's "downloading / in-progress" stage, whose
// markup is emitted by public/static/library.js (application logic that is
// deliberately left byte-for-byte untouched).
//
// For those slots the illustration is attached purely from CSS, as a
// `background-image`. A CSS background cannot inherit custom properties into
// the SVG's own fills, so we pre-bake a light and a dark copy and let CSS pick
// between them on `html[data-theme]`, cross-fading the two layers. The two
// palettes below are EXACTLY the prototype's `--illu-*` tokens for each theme.
// ---------------------------------------------------------------------------

/** Prototype light-theme illustration tokens (styles.css §1). */
const THEME_LIGHT = {
  '#111111': '#111111', // --illu-outline
  '#222222': '#222222', // --illu-mid
  '#6c3ef4': '#6C3EF4', // --illu-accent
  '#efd9cc': '#EFD9CC', // --illu-skin
  '#f2f2f5': '#F2F2F5', // --illu-paper
  '#e8e8ee': '#E8E8EE', // --illu-paperAlt
  '#ffffff': '#FFFFFF', // --illu-paperPure
}

/** Prototype dark-theme illustration tokens (styles.css §1, dark block). */
const THEME_DARK = {
  '#111111': '#201B33', // --illu-outline  (deep indigo, not black)
  '#222222': '#2B2445', // --illu-mid
  '#6c3ef4': '#A78BFF', // --illu-accent   (brighter purple pops on dark)
  '#efd9cc': '#D9B7A0', // --illu-skin     (softened so it doesn't glow)
  '#f2f2f5': '#E6E2F5', // --illu-paper    (off-white with a lilac cast)
  '#e8e8ee': '#C9C2E8', // --illu-paperAlt
  '#ffffff': '#F3F0FF', // --illu-paperPure
}

/**
 * Illustrations that additionally need baked light/dark copies because they are
 * placed from CSS rather than inlined. Names refer to the normalised output.
 */
const THEMED = [
  'file-searching.svg',       // library viewer — downloading / in-progress
  'the-search.svg',           // library listing — loading skeleton state
  'searching-everywhere.svg', // shelf — loading content
  'mail-sent.svg',            // copy-link / share view
  'enter.svg',                // "open this link in your browser" view
  'connection-lost.svg',      // offline / failed load
]

mkdirSync(OUT_DIR, { recursive: true })

let written = 0
for (const [src, out] of JOBS) {
  const from = resolve(SRC_DIR, src)
  let svg
  try {
    svg = readFileSync(from, 'utf8')
  } catch {
    console.warn(`[illustrations] skipped (missing source): ${src}`)
    continue
  }
  const normalised = recolor(svg, RECOLOR)
  writeFileSync(resolve(OUT_DIR, out), normalised, 'utf8')
  written += 1
  console.log(`[illustrations] ${src}  ->  ${out}`)
}

// Bake the light/dark pairs. These read back the NORMALISED file so the two
// variants are guaranteed to be the same artwork in two palettes.
let themed = 0
for (const name of THEMED) {
  const base = resolve(OUT_DIR, name)
  let svg
  try {
    svg = readFileSync(base, 'utf8')
  } catch {
    console.warn(`[illustrations] skipped theming (missing): ${name}`)
    continue
  }
  const stem = name.replace(/\.svg$/, '')
  writeFileSync(resolve(OUT_DIR, `${stem}-light.svg`), recolor(svg, THEME_LIGHT), 'utf8')
  writeFileSync(resolve(OUT_DIR, `${stem}-dark.svg`), recolor(svg, THEME_DARK), 'utf8')
  themed += 1
  console.log(`[illustrations] ${name}  ->  ${stem}-{light,dark}.svg`)
}

console.log(
  `[illustrations] normalised ${written}/${JOBS.length} illustration(s) and baked ` +
    `${themed} light/dark pair(s) into ${OUT_DIR}`
)
