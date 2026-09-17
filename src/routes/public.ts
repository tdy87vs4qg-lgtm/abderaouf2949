// ============================================================================
// تيسير — PUBLIC API routes (SERVER-SIDE, CREDENTIAL-FREE)
//
// This router is the one surface on the site that is served identically to
// EVERY visitor, signed in or not. It exists so the home page can whisper what
// the library contains without letting anyone reach what is inside it.
//
// The contract, deliberately narrow:
//
//   • NAMES ONLY. The response is a bare JSON array of strings. No Drive
//     identifier, no view or download link, no thumbnail, no mime type, no
//     ancestor trail, no counts, no envelope, no error text — nothing that
//     could be turned into a request for file content.
//   • NO INPUT. The route reads no query, no param, no header and no body,
//     and the path is a single literal with no `:param` and no wildcard.
//     There is nothing to enumerate, traverse or inject.
//   • NO IDENTITY. It performs no session lookup and no approval check, sets
//     no cookie and accepts no credentials, so the body is byte-identical
//     for every visitor and safe to hold in shared caches.
//   • ALWAYS 200. A cold cache, missing secrets or any internal problem all
//     degrade to `[]`. The endpoint has no failure mode a caller can observe.
// ============================================================================

import { Hono } from 'hono'
import { listFolder, readCachedRootFolderNames, type Env } from '../lib/drive'

type Bindings = Env

export const publicApi = new Hono<{ Bindings: Bindings }>()

/**
 * Read `c.executionCtx` without ever throwing. Hono exposes it as a getter
 * that raises when the Worker was invoked without one (tests, some local
 * runners), and this endpoint must answer 200 in every situation.
 */
function executionCtxOrNull(c: { executionCtx: unknown }): ExecutionContext | null {
  try {
    return (c.executionCtx as ExecutionContext) ?? null
  } catch {
    return null
  }
}

/**
 * GET /api/public/subjects → ["الرياضيات", "الفيزياء", …]
 *
 * Served straight out of the Drive cache that the library already maintains;
 * this path never calls Google inline. When the cache is cold or stale the
 * (empty or aging) answer is returned immediately and the existing cache
 * warm-up is scheduled AFTER the response, via waitUntil, so a public visitor
 * never waits on Drive and a cold cache cannot stampede it.
 */
publicApi.get('/subjects', async (c) => {
  const { names, stale } = await readCachedRootFolderNames(c.env)

  const res = c.body(JSON.stringify(names), 200, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
  })

  // Background refresh only — never awaited, so it cannot delay or alter the
  // response above. When `stale` is false this branch cannot run at all.
  //
  // `c.executionCtx` is a GETTER THAT THROWS when Hono was invoked without an
  // ExecutionContext, so it is read defensively: an unavailable context must
  // downgrade to "no background refresh", never to a 500.
  if (stale) {
    const ctx = executionCtxOrNull(c)
    if (ctx) {
      ctx.waitUntil(
        listFolder(c.env, undefined, {
          isSubscriber: false,
          // Same cast the library route already uses: Hono's ExecutionContext
          // and workers-types' differ only in an optional tracing field.
          ctx: ctx as unknown as ExecutionContext,
        }).catch(() => {})
      )
    }
  }

  return res
})
