/**
 * What this person uploaded with before: the comments and the single source values of their changesets, most recent
 * first, kept in the browser (changeset-history-store.ts) so that the save flyout can offer them again. iD gets the
 * same from the server's list of the person's changesets (recent-changesets.ts); this list is the person's own and
 * knows an upload at once. Everything here is pure.
 */
import { z } from 'zod'
import { cleanTagValue } from './changeset-draft.ts'

/** The most comments and the most single sources kept */
export const COMMENT_CAP = 20
export const SOURCE_CAP = 30

/** The stored history is this version of the format; another version is dropped, not guessed at */
export const HISTORY_VERSION = 1

/** Each list is most recent first, without duplicates */
export type ChangesetHistory = { comments: string[]; sources: string[] }

export const EMPTY_HISTORY: ChangesetHistory = { comments: [], sources: [] }

/**
 * The single values of a `source` tag: split at `;`, each one cleaned, empty ones dropped, each once, in the order
 * written. Case counts (`GPS` and `gps` are two values, as in iD's case-sensitive source field).
 */
export function sourceValues(source: string | undefined): string[] {
  if (source === undefined) return []
  return [
    ...new Set(
      source
        .split(';')
        .map(cleanTagValue)
        .filter((value) => value !== ''),
    ),
  ]
}

/** `added` in front of `list`, each value once (the first place wins), at most `cap` of them */
export function addRecent(
  list: readonly string[],
  added: readonly string[],
  cap: number,
): string[] {
  return [...new Set([...added, ...list])].slice(0, cap)
}

/**
 * The history after an upload with this comment and source. An empty comment adds none; a source adds each of its
 * values, in the order written, so the first one named is the first one offered.
 */
export function remember(
  history: ChangesetHistory,
  upload: { comment: string; source?: string | undefined },
): ChangesetHistory {
  const comment = cleanTagValue(upload.comment)
  return {
    comments: addRecent(history.comments, comment === '' ? [] : [comment], COMMENT_CAP),
    sources: addRecent(history.sources, sourceValues(upload.source), SOURCE_CAP),
  }
}

const stored = z.object({
  v: z.literal(HISTORY_VERSION),
  comments: z.array(z.string()),
  sources: z.array(z.string()),
})

/** The history as it is stored */
export function serializeHistory(history: ChangesetHistory): string {
  return JSON.stringify({ v: HISTORY_VERSION, ...history })
}

/** The stored history from its JSON text. Anything that does not fit, or another version, is an empty history. */
export function parseHistory(raw: string | null): ChangesetHistory {
  if (raw === null) return EMPTY_HISTORY
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return EMPTY_HISTORY
  }
  const parsed = stored.safeParse(json)
  if (!parsed.success) return EMPTY_HISTORY
  // read again through the rules above, so a hand-edited or old file cannot break the caps or the order
  return {
    comments: addRecent([], parsed.data.comments.map(cleanTagValue).filter(Boolean), COMMENT_CAP),
    sources: addRecent([], parsed.data.sources.map(cleanTagValue).filter(Boolean), SOURCE_CAP),
  }
}
