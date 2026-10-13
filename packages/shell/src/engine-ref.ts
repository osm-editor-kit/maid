/**
 * A bridge, until step 3 of docs/research/shell-package-plan.md passes the engine through a
 * context. The built-in module `relations` is imported by the app's config, and the app's config is
 * what `editor.ts` needs to create the engine. So `relations.tsx` cannot import `editor.ts` (that
 * is a cycle that cannot be evaluated); it asks for the engine here, when it renders. `editor.ts`
 * fills the holder as soon as the engine exists.
 *
 * The holder is a `const` object whose property is set once (no reassigned module-level `let`).
 */
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'

const holder: { engine?: MaidEngine } = {}

export function setLateEngine(engine: MaidEngine) {
  holder.engine = engine
}

/** The shell's engine. Only call this while rendering or in a handler, never at import time. */
export function lateEngine() {
  if (!holder.engine) throw new Error('The engine was asked for before the shell created it.')
  return holder.engine
}
