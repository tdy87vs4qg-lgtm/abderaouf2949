/* =====================================================================
   theme-lottie.js — dotLottie "theme toggle" animation FOLLOWER
   =====================================================================

   WHAT THIS IS
   ------------
   A purely decorative layer. It renders /static/animations/theme-toggle.lottie
   (a sun <-> moon morph, driven by its embedded state machine) inside every
   `.theme-toggle-lottie` host that lives in a `[data-theme-toggle]` button,
   and then makes that animation FOLLOW the current theme.

   WHAT THIS IS *NOT*
   ------------------
   It is NOT a theme control. It never sets `data-theme`, never touches
   localStorage, and never calls into the app. The single delegated click
   handler in /static/illustrations.js remains the ONE AND ONLY thing that
   toggles the theme. This module is a one-way observer:

       user taps <button data-theme-toggle>
         -> illustrations.js flips <html data-theme>
            -> our MutationObserver sees the change
               -> we drive the Lottie state machine to match

   Because the data flow is one-way, this file is safe to delete at any
   time: the button keeps working, it just stops being animated.

   FAILURE POLICY
   --------------
   Every entry point is wrapped in try/catch and NOTHING here ever throws.
   Any problem (missing asset, WASM blocked, old browser, state machine
   refusing to start) degrades to "no animation" + a single console.warn.
   The underlying button must keep working in all of those cases.

   ---------------------------------------------------------------------
   FACTS ABOUT THE ASSET (read out of the .lottie itself, not guessed)
   ---------------------------------------------------------------------
   manifest.json          -> animations: ["Main Scene"],
                             stateMachines: ["StateMachine1"]
   s/StateMachine1.json   -> initial state: "Day Idle"
     states:
       "Day Idle"      (loops segment "Day Idle")
                       --[Event "transition"]--> "Day to Night"
       "Day to Night"  (plays segment "Day to Night" once)
                       --[Boolean "___Day to Night_completed"]--> "Night Idle"
                       exitAction: SetBoolean toggle = true
       "Night Idle"    (loops segment "Night Idle")
                       --[Event "transition"]--> "Night to Day"
       "Night to Day"  (plays segment "Night to Day" once)
                       --[Boolean "___Night to Day_completed"]--> "Day Idle"
                       exitAction: SetBoolean toggle = false
     inputs:
       "toggle"      Boolean  (init false)
       "transition"  Event
       "___Day to Night_completed" / "___Night to Day_completed"  Boolean
                     (internal bookkeeping, set by OnComplete interactions)
     interactions:
       Click on layer "Sun"  -> Fire "transition"
       Click on layer "Moon" -> Fire "transition"

   TWO CONSEQUENCES OF THOSE FACTS, both of which shape the code below:

   (1) THE BOOLEAN "toggle" IS NOT A GUARD. Nothing in the machine ever
       *reads* it — it only appears as the target of `SetBoolean` exit
       actions, i.e. it is a read-out mirror of "am I currently night?".
       Therefore `stateMachineSetBooleanInput('toggle', true)` CANNOT by
       itself move the machine to night. The only thing that advances an
       idle state is firing the `transition` EVENT, and the only way to
       arrive at a state instantly is `stateMachineOverrideState(name)`.
       We still keep `toggle` in sync (cheap, and keeps the machine's own
       bookkeeping honest) but we never rely on it to cause motion.

   (2) THE RUNTIME WILL WIRE UP THOSE SUN/MOON CLICKS FOR US, WHICH WE DO
       NOT WANT. dotlottie-web's `stateMachineStart()` calls its internal
       `_setupStateMachineListeners()`, which — because the machine
       declares Click interactions — adds a real `click` listener to our
       canvas that fires `transition`. Left alone, one user tap would
       animate twice: once from the canvas listener, once from our
       observer reacting to illustrations.js. See `neutraliseCanvasInput()`
       for how that is prevented.

   (3) THE FIRST PAINT IS ALWAYS THE SUN, AND IT LANDS BEFORE WE CAN
       OVERRIDE IT. Two measured behaviours of this runtime combine here:
         - `stateMachineStart()` (re)sets the machine to its declared
           initial state, "Day Idle", and paints that frame synchronously.
           Overriding BEFORE start is therefore pointless: start throws the
           override away. The override must happen AFTER start.
         - `stateMachineOverrideState(name, true)` updates the reported
           state synchronously, but the matching artwork only reaches the
           canvas on the NEXT animation frame.
       So on a dark-mode load there is unavoidably one sun frame rendered
       into the canvas. The fix is compositing, not state: the canvas is
       created at `opacity: 0` and only revealed a few frames after the
       override, once the night artwork is genuinely on screen. That is
       what `REVEAL_RAF_TICKS` is for, and it is why a dark-mode visitor
       never *sees* the sun even though one sun frame was drawn.
   ===================================================================== */

// The runtime is an ES module served from our own origin (no CDN), which is
// why this file must itself be loaded with <script type="module">.
import { DotLottie } from '/static/vendor/dotlottie-web/0.80.0/dotlottie-web.esm.js';

/* ------------------------------------------------------------------ *
 * Constants                                                          *
 * ------------------------------------------------------------------ */

const VENDOR_DIR = '/static/vendor/dotlottie-web/0.80.0';
const WASM_URL   = `${VENDOR_DIR}/dotlottie-player.wasm`;
const SRC        = '/static/animations/theme-toggle.lottie';

const SM_ID       = 'StateMachine1';
const EVENT_INPUT = 'transition';   // the Event input; the ONLY motion driver
const BOOL_INPUT  = 'toggle';       // mirror-only Boolean (see note (1) above)

const STATE_DAY      = 'Day Idle';
const STATE_NIGHT    = 'Night Idle';
const STATE_TO_NIGHT = 'Day to Night';
const STATE_TO_DAY   = 'Night to Day';

const HOST_SELECTOR   = '.theme-toggle-lottie';
const TOGGLE_SELECTOR = '[data-theme-toggle]';

// Marks a host as already initialised so a second scan() is a no-op.
const INIT_FLAG = 'data-theme-lottie-ready';

// Cap the backing-store resolution: this is a ~40px icon, 3x is plenty and
// keeps memory/GPU cost negligible on phones.
const MAX_DPR = 3;

// If the host has no layout yet (its CSS arrives in a later step), start the
// canvas at this CSS size; the ResizeObserver corrects it the moment real
// styles land.
const FALLBACK_SIZE = 40;

/* How many animation frames to wait after forcing the initial state before
   the canvas is revealed. See note (3) in the header: the state changes
   synchronously but the matching artwork only reaches the canvas on the
   NEXT frame, so revealing any earlier shows one frame of the wrong icon.
   Measured on this exact runtime + asset: sampling every rAF tick straight
   after `stateMachineOverrideState('Night Idle', true)` gives
     tick 1 -> sun,  tick 2 -> moon,  tick 3+ -> moon.
   Three ticks (~50ms, invisible to the user) keeps a safety margin. */
const REVEAL_RAF_TICKS = 3;

/* ------------------------------------------------------------------ *
 * Small helpers                                                      *
 * ------------------------------------------------------------------ */

/** Single, consistent place for non-fatal diagnostics. Never throws. */
function warn(message, error) {
  try {
    if (error !== undefined) console.warn(`[theme-lottie] ${message}`, error);
    else console.warn(`[theme-lottie] ${message}`);
  } catch (_) {
    /* console itself unavailable — nothing sensible left to do */
  }
}

/** Current theme as written on <html>. Anything unknown counts as light. */
function currentTheme() {
  try {
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light';
  } catch (_) {
    return 'light';
  }
}

/** Live read (not cached): the user can flip this setting mid-session. */
function prefersReducedMotion() {
  try {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) {
    return false;
  }
}

/** The idle state that represents a given theme. */
function idleStateFor(theme) {
  return theme === 'dark' ? STATE_NIGHT : STATE_DAY;
}

/* ------------------------------------------------------------------ *
 * WASM location                                                      *
 * ------------------------------------------------------------------ *
 * Point the runtime at our self-hosted binary. This is also what stops
 * dotlottie-web falling back to jsdelivr/unpkg, so the page makes no
 * third-party requests. Done exactly once, before any instance exists. */

let wasmConfigured = false;

function configureWasmOnce() {
  if (wasmConfigured) return;
  wasmConfigured = true;
  try {
    DotLottie.setWasmUrl(WASM_URL);
  } catch (error) {
    // Non-fatal: the runtime would then try its default URL. If that is
    // blocked, load simply fails and we degrade to "no animation".
    warn('could not set the self-hosted WASM URL', error);
  }
}

/* ------------------------------------------------------------------ *
 * Instance registry                                                  *
 * ------------------------------------------------------------------ *
 * One entry per animated toggle. There can legitimately be several
 * (e.g. a header button and one inside a mobile menu), and the single
 * MutationObserver below drives all of them. */

/**
 * @type {Array<{
 *   host: Element,
 *   canvas: HTMLCanvasElement,
 *   dot: any,
 *   ready: boolean,          // state machine confirmed running
 *   desiredTheme: string,    // theme we are animating towards
 *   pending: boolean         // a change arrived mid-transition; reconcile later
 * }>}
 */
const instances = [];

/* ------------------------------------------------------------------ *
 * Canvas creation / sizing                                           *
 * ------------------------------------------------------------------ */

/**
 * Create the <canvas> that fills the host.
 *
 * It starts at `opacity: 0`. We only reveal it once the correct initial
 * idle state has been forced, which is what guarantees a dark-mode
 * visitor never catches a frame of the sun (see `applyInitialState`).
 * If loading fails the canvas simply stays invisible — the button below
 * it is untouched and still works.
 */
function createCanvas(host) {
  const canvas = document.createElement('canvas');

  // Inline styles only: this module must not depend on CSS that does not
  // exist yet (the stylesheet for the host lands in a later step).
  canvas.style.display       = 'block';
  canvas.style.width         = '100%';
  canvas.style.height        = '100%';
  canvas.style.opacity       = '0';          // revealed after state is correct
  canvas.style.pointerEvents = 'none';       // see neutraliseCanvasInput()

  // Decorative: the button already carries the accessible label/aria-pressed
  // that illustrations.js maintains, so this must not be announced.
  canvas.setAttribute('aria-hidden', 'true');

  host.appendChild(canvas);
  return canvas;
}

/**
 * Match the canvas backing store to its CSS box at device pixel ratio,
 * so the icon is crisp on retina screens. Returns true if the size
 * actually changed (used to avoid pointless resize() churn).
 */
function sizeCanvas(canvas) {
  try {
    const dpr  = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const rect = canvas.getBoundingClientRect();

    // Host may have no layout yet — fall back, ResizeObserver will fix it.
    const cssW = rect.width  > 0 ? rect.width  : FALLBACK_SIZE;
    const cssH = rect.height > 0 ? rect.height : FALLBACK_SIZE;

    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));

    if (canvas.width === w && canvas.height === h) return false;
    canvas.width  = w;
    canvas.height = h;
    return true;
  } catch (error) {
    warn('canvas sizing failed', error);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Killing the built-in Sun/Moon click interactions                   *
 * ------------------------------------------------------------------ *
 * REQUIREMENT: a tap on the artwork must NOT itself fire `transition`,
 * otherwise the tap animates twice (once via the runtime's own canvas
 * click listener, once via our observer reacting to illustrations.js).
 *
 * Two independent defences, because one of them uses a private API:
 *
 *  1. `pointer-events: none` on the canvas (and the host). This is the
 *     robust, public-API-only fix: the click event is never dispatched
 *     to the canvas at all, so the runtime's listener cannot fire. The
 *     event lands on the <button> instead, bubbles to document, and
 *     illustrations.js handles it exactly as if the artwork were a
 *     plain static icon. Note we must NOT instead swallow the event on
 *     the canvas (stopImmediatePropagation) — that would also stop it
 *     reaching the delegated handler and would break the real toggle.
 *
 *  2. A guarded, best-effort call to the runtime's internal
 *     `_cleanupStateMachineListeners()`, which removes the listeners it
 *     just attached in `stateMachineStart()`. Private and therefore
 *     optional: wrapped in try/catch and only called if it exists.
 *     Defence 1 alone is already sufficient.
 */
function neutraliseCanvasInput(entry) {
  // --- defence 1: let every pointer event pass straight to the button ---
  try {
    entry.canvas.style.pointerEvents = 'none';
    // The host wrapper is ours too, so it may as well be transparent to
    // input; this keeps hit-testing on the button itself.
    if (entry.host && entry.host.style) entry.host.style.pointerEvents = 'none';
  } catch (error) {
    warn('could not make the canvas click-through', error);
  }

  // --- defence 2: ask the runtime to drop its own listeners (private) ---
  try {
    const dot = entry.dot;
    if (dot && typeof dot._cleanupStateMachineListeners === 'function') {
      dot._cleanupStateMachineListeners();
    }
  } catch (_) {
    // Entirely expected on any build where that internal is absent or
    // renamed. Defence 1 already covers us, so stay silent.
  }
}

/* ------------------------------------------------------------------ *
 * State machine driving                                              *
 * ------------------------------------------------------------------ */

/** Current machine state, or '' if it cannot be read. Never throws. */
function machineState(entry) {
  try {
    return entry.dot.stateMachineGetCurrentState() || '';
  } catch (_) {
    return '';
  }
}

/**
 * Keep the machine's `toggle` Boolean consistent with the theme.
 * Purely cosmetic bookkeeping — see note (1) in the header: no guard
 * reads this input, so it can never move the machine on its own.
 */
function syncBooleanMirror(entry, theme) {
  try {
    entry.dot.stateMachineSetBooleanInput(BOOL_INPUT, theme === 'dark');
  } catch (_) {
    /* older/newer runtimes may not expose it — harmless */
  }
}

/**
 * Jump instantly to the idle state for `theme`, with no transition.
 * Used for (a) the very first paint and (b) prefers-reduced-motion.
 */
function snapToIdle(entry, theme) {
  const target = idleStateFor(theme);
  try {
    // Second argument = "tick immediately", so the new state's segment is
    // rendered on the spot rather than one frame later.
    entry.dot.stateMachineOverrideState(target, true);
  } catch (error) {
    warn(`could not snap to "${target}"`, error);
  }
  syncBooleanMirror(entry, theme);
}

/**
 * Animate towards `theme`, playing the proper morph segment.
 *
 * The machine's guards mean `transition` only does something useful from
 * the *opposite* idle state, so this reconciles position first:
 *
 *   already in the target idle        -> nothing to do
 *   mid-morph ("Day to Night" etc.)   -> remember it and retry when the
 *                                        morph lands (see onStateEntered)
 *   in the opposite idle              -> fire `transition`
 *   unreadable / unexpected state     -> snap straight to the target
 */
function driveTo(entry, theme) {
  entry.desiredTheme = theme;

  if (!entry.ready) return;                 // not started yet; boot will apply

  // Honour the accessibility preference at the moment of the change.
  if (prefersReducedMotion()) {
    entry.pending = false;
    snapToIdle(entry, theme);
    return;
  }

  const target = idleStateFor(theme);
  const state  = machineState(entry);

  if (state === target) {                   // nothing to animate
    entry.pending = false;
    syncBooleanMirror(entry, theme);
    return;
  }

  if (state === STATE_TO_NIGHT || state === STATE_TO_DAY) {
    // A morph is already playing. Interrupting it looks broken, so let it
    // finish and re-evaluate on arrival — this also collapses a burst of
    // rapid taps into the correct final state.
    entry.pending = true;
    return;
  }

  const opposite = theme === 'dark' ? STATE_DAY : STATE_NIGHT;

  if (state === opposite) {
    entry.pending = false;
    try {
      entry.dot.stateMachineFireEvent(EVENT_INPUT);   // play the morph
    } catch (error) {
      warn('firing the transition event failed; snapping instead', error);
      snapToIdle(entry, theme);
    }
    return;
  }

  // Unknown/empty state (machine not reporting, or an unexpected name):
  // correctness beats prettiness, so land on the right frame immediately.
  entry.pending = false;
  snapToIdle(entry, theme);
}

/**
 * Fires whenever the machine enters a state. We use it purely to settle
 * any change that arrived while a morph was mid-flight.
 */
function onStateEntered(entry, state) {
  if (state !== STATE_DAY && state !== STATE_NIGHT) return;  // still morphing

  // The machine's own exit actions already updated `toggle`; re-assert it
  // from the state we actually landed in so the two cannot drift.
  syncBooleanMirror(entry, state === STATE_NIGHT ? 'dark' : 'light');

  if (!entry.pending) return;
  entry.pending = false;

  // Re-read <html> rather than trusting the stored value: the theme may
  // have been flipped more than once while the morph was playing.
  driveTo(entry, currentTheme());
}

/**
 * Called once the machine is confirmed running. Forces the artwork onto
 * the frame that matches the CURRENT theme and only THEN reveals the
 * canvas, so a dark-mode visitor never sees the sun.
 *
 * The two-step (snap, then reveal a few frames later) is required by the
 * runtime's behaviour documented in note (3) of the header: the sun frame
 * is already painted by `stateMachineStart()`, and our override only
 * reaches the canvas on a subsequent frame. Revealing immediately — which
 * is what a naive implementation does — makes that sun frame visible.
 */
function applyInitialState(entry) {
  const theme = currentTheme();
  entry.desiredTheme = theme;

  // Always snap (never animate) on first paint — there is no "previous"
  // theme to morph away from. For light this lands back on the machine's
  // own initial state; asserting it explicitly keeps both branches
  // symmetrical and guards against a non-default initial state.
  snapToIdle(entry, theme);

  revealWhenPainted(entry);
}

/**
 * Reveal the canvas once the corrected frame is actually on screen.
 *
 * Waits REVEAL_RAF_TICKS animation frames. rAF is used rather than a
 * timer because it is tied to the compositor: each callback runs before a
 * paint, so N callbacks reliably means "N frames have been rendered".
 * If rAF is unavailable we reveal immediately — a single mis-coloured
 * frame is a far better failure mode than a permanently invisible icon.
 */
function revealWhenPainted(entry) {
  const show = () => {
    try {
      entry.canvas.style.opacity = '1';
    } catch (_) { /* ignore */ }
  };

  try {
    if (typeof window.requestAnimationFrame !== 'function') {
      show();
      return;
    }

    let ticks = 0;
    const step = () => {
      try {
        ticks += 1;
        if (ticks < REVEAL_RAF_TICKS) {
          window.requestAnimationFrame(step);
          return;
        }
        show();
      } catch (error) {
        warn('reveal step failed; showing anyway', error);
        show();
      }
    };

    window.requestAnimationFrame(step);
  } catch (error) {
    warn('could not schedule the reveal; showing immediately', error);
    show();
  }
}

/* ------------------------------------------------------------------ *
 * Per-host boot                                                      *
 * ------------------------------------------------------------------ */

/**
 * Build one canvas + DotLottie instance for a single host element.
 * Returns silently on any failure (the button is unaffected).
 */
function initHost(host) {
  let entry = null;

  try {
    // Idempotency guard: never attach twice to the same host.
    if (host.hasAttribute(INIT_FLAG)) return;
    host.setAttribute(INIT_FLAG, '');

    configureWasmOnce();

    const canvas = createCanvas(host);
    sizeCanvas(canvas);

    entry = {
      host,
      canvas,
      dot: null,
      ready: false,
      desiredTheme: currentTheme(),
      pending: false
    };

    // `autoplay: false` / `loop: false`: timeline playback is not ours to
    // control. Each PlaybackState in the machine declares its own segment,
    // autoplay and loop, so the machine is what drives the frames.
    entry.dot = new DotLottie({
      canvas,
      src: SRC,
      autoplay: false,
      loop: false,
      stateMachineId: SM_ID,        // load the machine as part of loading
      backgroundColor: '#00000000'  // fully transparent over the button
    });

    instances.push(entry);

    // ---- load succeeded: start the machine and set the initial frame ----
    entry.dot.addEventListener('load', () => {
      try {
        startMachine(entry);
      } catch (error) {
        warn('state machine start failed', error);
      }
    });

    // ---- load failed: leave the canvas invisible, button still works ----
    entry.dot.addEventListener('loadError', (event) => {
      warn('animation failed to load', (event && event.error) || event);
    });

    entry.dot.addEventListener('stateMachineError', (event) => {
      warn('state machine error', (event && event.error) || event);
    });

    // ---- the hook used to settle mid-morph theme changes ----
    entry.dot.addEventListener('stateMachineStateEntered', (event) => {
      try {
        onStateEntered(entry, (event && event.state) || '');
      } catch (error) {
        warn('state-entered handler failed', error);
      }
    });

    observeHostSize(entry);
  } catch (error) {
    warn('could not initialise a theme toggle animation', error);
    // Best effort tidy-up so a half-built instance cannot render garbage.
    try {
      if (entry && entry.canvas) entry.canvas.style.opacity = '0';
    } catch (_) { /* ignore */ }
  }
}

/**
 * Load + start StateMachine1, then immediately disable its click
 * interactions and force the correct initial idle state.
 *
 * Order matters: `stateMachineStart()` is what attaches the runtime's
 * canvas listeners, so `neutraliseCanvasInput()` must run *after* it.
 */
function startMachine(entry) {
  const dot = entry.dot;

  // The constructor's `stateMachineId` normally loads it already; only
  // load explicitly if nothing is active, so we do not reset it.
  let activeId = '';
  try { activeId = dot.stateMachineGetActiveId() || ''; } catch (_) { /* ignore */ }

  if (!activeId) {
    let loaded = false;
    try { loaded = dot.stateMachineLoad(SM_ID); } catch (error) {
      warn(`stateMachineLoad("${SM_ID}") threw`, error);
    }
    if (!loaded) {
      warn(`could not load state machine "${SM_ID}" — animation disabled`);
      return;                                   // canvas stays invisible
    }
  }

  let started = false;
  try { started = dot.stateMachineStart(); } catch (error) {
    warn('stateMachineStart() threw', error);
  }

  let running = false;
  try { running = !!dot.isStateMachineRunning; } catch (_) { /* ignore */ }

  if (!started || !running) {
    // Without a running machine there is no sensible static frame to show,
    // so stay hidden rather than risk displaying the wrong icon.
    warn('state machine did not start — animation disabled');
    return;
  }

  entry.ready = true;

  // Must come after start(): it is start() that added the click listeners.
  neutraliseCanvasInput(entry);

  // Show the correct sun/moon for the theme, then reveal the canvas.
  applyInitialState(entry);

  // A theme change could have been dispatched between construction and
  // now; re-read <html> and catch up if so.
  const theme = currentTheme();
  if (theme !== entry.desiredTheme) driveTo(entry, theme);
}

/* ------------------------------------------------------------------ *
 * Keep the canvas crisp when the host is resized                     *
 * ------------------------------------------------------------------ *
 * Important here because the host's stylesheet arrives in a LATER step:
 * the element may well be 0x0 at boot and gain its real size afterwards.
 * This is a ResizeObserver (element geometry), not a MutationObserver —
 * the single attribute MutationObserver required by the spec is the one
 * on <html> further down. */

function observeHostSize(entry) {
  try {
    if (typeof ResizeObserver !== 'function') return;

    const ro = new ResizeObserver(() => {
      try {
        if (!sizeCanvas(entry.canvas)) return;   // nothing actually changed
        if (entry.dot && typeof entry.dot.resize === 'function') {
          entry.dot.resize();
        }
      } catch (error) {
        warn('resize handling failed', error);
      }
    });

    ro.observe(entry.host);
  } catch (error) {
    warn('could not observe host size', error);
  }
}

/* ------------------------------------------------------------------ *
 * THE MutationObserver — this is what makes the animation "follow"   *
 * ------------------------------------------------------------------ *
 * Exactly ONE observer, on <html>, watching only `data-theme`.
 *
 * illustrations.js writes that attribute; we read it. There is no path
 * back from here to the theme, so no feedback loop is possible. */

let themeObserverStarted = false;

function observeTheme() {
  if (themeObserverStarted) return;
  themeObserverStarted = true;

  try {
    let lastTheme = currentTheme();

    const observer = new MutationObserver(() => {
      try {
        const theme = currentTheme();
        if (theme === lastTheme) return;   // e.g. 'light' rewritten as 'light'
        lastTheme = theme;

        // Drive every instance; each decides for itself whether to morph,
        // snap (reduced motion) or queue (already mid-morph).
        for (const entry of instances) {
          try {
            driveTo(entry, theme);
          } catch (error) {
            warn('could not drive an instance to the new theme', error);
          }
        }
      } catch (error) {
        warn('theme observer callback failed', error);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  } catch (error) {
    warn('could not observe data-theme — animation will not follow', error);
  }
}

/* ------------------------------------------------------------------ *
 * Scan + boot                                                        *
 * ------------------------------------------------------------------ */

/**
 * Initialise every not-yet-initialised host. Safe to call repeatedly:
 * the INIT_FLAG attribute makes already-wired hosts a no-op.
 *
 * Only hosts inside a `[data-theme-toggle]` are touched, so a stray
 * `.theme-toggle-lottie` elsewhere is deliberately ignored.
 */
function scan() {
  try {
    const hosts = document.querySelectorAll(HOST_SELECTOR);

    for (const host of hosts) {
      try {
        // `closest` is guarded for very old engines; without it we cannot
        // prove the host belongs to a toggle, so we skip it.
        if (typeof host.closest !== 'function') continue;
        if (!host.closest(TOGGLE_SELECTOR)) continue;
        initHost(host);
      } catch (error) {
        warn('skipping a malformed animation host', error);
      }
    }

    return hosts.length;
  } catch (error) {
    warn('host scan failed', error);
    return 0;
  }
}

/** Entry point. Wrapped so a failure here can never break the page. */
function boot() {
  try {
    observeTheme();   // start following the theme even if no host exists yet
    scan();
  } catch (error) {
    warn('boot failed — toggles will work without animation', error);
  }
}

try {
  if (document.readyState === 'loading') {
    // `once` so a stray second DOMContentLoaded cannot double-boot.
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    // Module executed after the document was already parsed (e.g. injected
    // late, or loaded with a plain `defer`-like ordering) — boot now.
    boot();
  }
} catch (error) {
  warn('could not schedule boot', error);
}

/* ------------------------------------------------------------------ *
 * Tiny read-mostly hook for later steps                              *
 * ------------------------------------------------------------------ *
 * If a toggle button is rendered dynamically (after boot), that step can
 * call `window.taysirThemeLottie.scan()` to wire it up. Nothing outside
 * this file references it yet, and the site works without it. */

try {
  window.taysirThemeLottie = {
    scan,
    /** How many animated toggles are live right now. */
    count: () => instances.length
  };
} catch (_) {
  /* exotic environment with a locked window — purely optional anyway */
}
