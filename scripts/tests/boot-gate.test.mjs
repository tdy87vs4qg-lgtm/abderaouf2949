// Harness: extract the boot-gate block from public/static/library.js (from the
// "if (FC && FC.supported)" line through the end of the preBind.then chain)
// and drive it with a fake FC + fake fetch. Asserts:
//   1. IndexedDB pre-bind that NEVER settles → startApp fires once at ~600ms.
//   2. Pre-bind settles fast → startApp fires once, immediately, deadline cleared.
//   3. Pre-bind settles LATE (after deadline) → startApp still fires exactly once.
//   4. /api/auth/me is fetched exactly once per boot.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../public/static/library.js', import.meta.url), 'utf8');
const start = src.indexOf('    if (FC && FC.supported) {\n      // 1. OPTIMISTIC PRE-BIND');
const end = src.indexOf('    } else {\n      startApp();\n    }', start);
if (start < 0 || end < 0) throw new Error('boot block not found');
const block = src.slice(start, end) + '    }\n';

function boot({ prebindDelay }) {
  let starts = 0, fetches = 0;
  const FC = {
    supported: true,
    bindStoredSession: () => new Promise((res) => {
      if (prebindDelay != null) setTimeout(() => res('user-1'), prebindDelay);
    }),
    bindSession: () => Promise.resolve(),
    deriveKey: (u) => 'u:' + u.id,
  };
  const ctx = vm.createContext({
    FC, setTimeout, clearTimeout, console: { log() {} }, Promise, Error,
    fetch: () => { fetches++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, authenticated: false }) }); },
    startApp: () => { starts++; },
    requestPersistentStorage: () => {},
  });
  const t0 = Date.now();
  vm.runInContext(block, ctx);
  return { starts: () => starts, fetches: () => fetches, t0 };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
function check(name, ok, info) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) fail++; }

{ const b = boot({ prebindDelay: null });
  await wait(400); check('never-settling IDB: not started before deadline', b.starts() === 0, `starts=${b.starts()} @400ms`);
  await wait(400); check('never-settling IDB: started once by ~600ms', b.starts() === 1, `starts=${b.starts()} @800ms`);
  await wait(500); check('never-settling IDB: still exactly once', b.starts() === 1 && b.fetches() === 1, `starts=${b.starts()} fetches=${b.fetches()}`); }

{ const b = boot({ prebindDelay: 20 });
  await wait(100); check('fast IDB: started once immediately', b.starts() === 1, `starts=${b.starts()} @100ms`);
  await wait(700); check('fast IDB: deadline did not double-start', b.starts() === 1 && b.fetches() === 1, `starts=${b.starts()} fetches=${b.fetches()}`); }

{ const b = boot({ prebindDelay: 1200 });
  await wait(800); check('late IDB: deadline started once', b.starts() === 1, `starts=${b.starts()} @800ms`);
  await wait(700); check('late IDB: late pre-bind did not start again', b.starts() === 1 && b.fetches() === 1, `starts=${b.starts()} fetches=${b.fetches()}`); }

process.exit(fail ? 1 : 0);
