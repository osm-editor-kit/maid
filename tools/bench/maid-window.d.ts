import type { Map as MapLibreMap } from 'maplibre-gl'
/**
 * The debug handle that Maid sets on `window` in dev and test builds (apps/maid/src/bench.ts).
 * The browser checks and agents read it inside `page.evaluate`, so its shape is declared once
 * here. The contract for the editor itself is `window.__bench` in tools/refs/bench-api.d.ts.
 *
 * Private members of the engine are not visible here. A check that reads one on purpose goes
 * through the helper in tools/bench/check-helpers.ts and says why there.
 */
// Relative imports: the root tsconfig cannot resolve the workspace packages by name (only apps/maid
// links them), and an unresolved import in a .d.ts becomes `any` without an error (skipLibCheck).
import type { Editor } from '../../packages/core/src/index'
import type * as model from '../../packages/model/src/index'
import type { MaidEngine } from '../../packages/renderer/src/index'

export type MaidHandle = {
  /** The MapLibre map the engine draws on */
  map: MapLibreMap
  engine: MaidEngine
  editor: Editor
  /** The data model's module: entity classes and actions */
  model: typeof model
  /** Resolves when the journal has written its pending edits to the browser's storage */
  journalFlushed: () => Promise<void>
}

declare global {
  interface Window {
    __maid: MaidHandle
  }
}
