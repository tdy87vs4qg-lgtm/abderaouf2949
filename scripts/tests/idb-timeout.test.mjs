// Harness: load public/static/file-cache.js in a fake browser where
// indexedDB.open() NEVER fires any event, and assert that openDb() (via a
// public read) now rejects/settles within the 3s deadline instead of hanging.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../public/static/file-cache.js', import.meta.url), 'utf8');

function makeWindow({ neverSettle, lateSuccessAfter }) {
  let closed = 0;
  const fakeDb = {
    version: 3,
    objectStoreNames: { contains: () => true },
    close() { closed++; },
    transaction() {
      return {
        objectStore: () => ({
          get: () => {
            const r = {};
            setTimeout(() => { r.result = undefined; r.onsuccess && r.onsuccess(); }, 0);
            return r;
          },
        }),
      };
    },
  };
  const indexedDB = {
    open() {
      const req = {};
      if (!neverSettle) {
        setTimeout(() => { req.result = fakeDb; req.onsuccess && req.onsuccess(); }, lateSuccessAfter || 0);
      }
      return req;
    },
  };
  const win = { indexedDB, setTimeout, clearTimeout, console, navigator: {}, Date, Promise, Error, Array, Object, JSON, Math };
  win.window = win;
  win.self = win;
  return { win, stats: () => ({ closed }) };
}

async function run(name, opts, expect) {
  const { win, stats } = makeWindow(opts);
  const ctx = vm.createContext(win);
  vm.runInContext(src, ctx, { filename: 'file-cache.js' });
  const FC = win.TaysirFileCache || win.FileCache || Object.values(win).find(v => v && typeof v === 'object' && typeof v.bindStoredSession === 'function');
  if (!FC) throw new Error('file-cache global not found; keys=' + Object.keys(win).join(','));
  const t0 = Date.now();
  const result = await Promise.race([
    FC.bindStoredSession().then(() => 'settled'),
    new Promise(r => setTimeout(() => r('HUNG'), 6000)),
  ]);
  const dt = Date.now() - t0;
  // give a late success a chance to arrive and be closed
  if (opts.lateSuccessAfter) await new Promise(r => setTimeout(r, opts.lateSuccessAfter - dt + 200));
  const ok = expect(result, dt, stats());
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  result=${result} dt=${dt}ms closed=${stats().closed}`);
  if (!ok) process.exitCode = 1;
}

await run('open never settles → bindStoredSession settles within ~3s',
  { neverSettle: true },
  (r, dt) => r === 'settled' && dt >= 2900 && dt < 4000);

await run('open succeeds late (after timeout) → stray handle is closed',
  { lateSuccessAfter: 3500 },
  (r, dt, s) => r === 'settled' && dt < 4000 && s.closed === 1);

await run('open succeeds fast → no timeout involvement',
  { lateSuccessAfter: 20 },
  (r, dt, s) => r === 'settled' && dt < 500 && s.closed === 0);
