/**
 * The hooks the shell runs. Modules listen with `api.on(name, listener)` (ARCHITECTURE.md, Maid modules).
 */
import { type Action, declareHooks } from '@osm-editor-kit/maid-core'

declare module '@osm-editor-kit/maid-core' {
  interface Hooks {
    /**
     * An upload succeeded and the history was reset: what a module kept about the uploaded edits is done (the review
     * of a loaded osmChange file). The argument is the ids of the changesets.
     */
    'changeset.uploaded': Action<[changesets: readonly number[]], 'experimental'>
  }
}

declareHooks({ 'changeset.uploaded': 'experimental' })
