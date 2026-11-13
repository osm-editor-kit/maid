/**
 * The hooks the shell runs. Modules listen with `api.on(name, listener)` (ARCHITECTURE.md, Maid modules).
 */
import { type Action, declareHooks } from '@osm-editor-kit/maid-core'

declare module '@osm-editor-kit/maid-core' {
  interface Hooks {
    /**
     * An upload succeeded and the history was reset: what a module kept about the uploaded edits is done (the review
     * of a loaded osmChange file). The arguments are the ids of the changesets and what the upload was: its comment, the
     * server and who uploaded (MapRoulette reports its tasks as fixed with a link to the changeset).
     */
    'changeset.uploaded': Action<
      [changesets: readonly number[], upload: UploadInfo],
      'experimental'
    >
  }
}

/** What an upload was, for a module that reports it elsewhere */
export type UploadInfo = {
  /** The changeset comment, with its hashtags as the server got it */
  comment: string
  /** The server the changesets are on */
  server: 'osm' | 'dev'
  /** The display name of who uploaded; absent when it is not known */
  user?: string
  /** The address of a changeset on the server's website */
  changesetUrl: (id: number) => string
}

declareHooks({ 'changeset.uploaded': 'experimental' })
