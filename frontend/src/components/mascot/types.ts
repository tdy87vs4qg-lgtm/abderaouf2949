/**
 * The mascot's emotional / behavioural state, driven by the login form.
 *  - 'idle'    : happy, eyes open, gazing around, breathing.
 *  - 'covering': hiding its eyes behind its hands (password hidden while typing).
 *  - 'peeking' : opening a gap between fingers to secretly look (password shown).
 */
export type MascotState = 'idle' | 'covering' | 'peeking'
