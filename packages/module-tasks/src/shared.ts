import type { MaidEngine } from '@osm-editor-kit/maid-renderer'

/** What the module's parts hand each other at run time: the map engine, once the map is up, and the retry of the sync */
export type Shared = {
  engine?: MaidEngine
  /** Set by the controller while a sync runs; the dock's retry button calls it */
  retry?: () => void
}
