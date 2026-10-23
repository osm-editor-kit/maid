/**
 * The warnings under the comment and the source when they name a product OSM must not copy from (Google, Baidu,
 * Amap), as iD's changeset editor shows them (ui/changeset_editor.js, `findIncompatibleSources`). The rules are the
 * validation rule's (maid-validation); a warning never blocks the upload.
 */
import { incompatibleSourceMentions } from '@osm-editor-kit/maid-validation'

/** Where iD's warning links to */
export const COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'

export type ChangesetWarning = {
  /** Stable per field and product: `comment.google`, `source.baidu` */
  id: string
  /** `You mentioned "Google" in this changeset comment.` plus why it is refused */
  text: string
}

/** The warnings for one field: one per product named */
export function warningsFor(
  field: 'comment' | 'source',
  text: string | undefined,
): ChangesetWarning[] {
  const where = field === 'comment' ? 'in this changeset comment' : 'as a source of this changeset'
  return incompatibleSourceMentions(text).map((mention) => ({
    id: `${field}.${mention.product}`,
    text: `You mentioned "${mention.value}" ${where}. ${mention.reference}`,
  }))
}

/** The warnings of a draft, the comment's first */
export function changesetWarnings(draft: { comment: string; source?: string | undefined }) {
  return {
    comment: warningsFor('comment', draft.comment),
    source: warningsFor('source', draft.source),
  }
}
