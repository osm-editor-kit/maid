/**
 * The changeset's comment, hashtags and source, as iD keeps them (ui/commit.js, core/context.ts). A link can
 * prefill them (`comment`, `hashtags`, `source` in the address, iD's hash parameters), and what the person types
 * is kept between visits. Everything here is pure: the store that keeps the draft is in changeset-draft-store.ts.
 */
import { z } from 'zod'

/** OSM's limit for a tag value; iD's `maxCharsForTagValue` */
export const TAG_VALUE_MAX = 255

/** A stored draft expires two days after its last change (iD: `cutoff` in commit.js initChangeset) */
export const DRAFT_TTL_MS = 2 * 86_400_000

/** The values as the person sees them. `hashtags` is the `hashtags` tag, which iD keeps even when the comment has none. */
export type Draft = { comment: string; hashtags?: string; source?: string }

/** The draft as it is stored, with the time of its last change (iD's `commentDate`) */
export type StoredDraft = Draft & { commentDate: number }

/** The values a link gives. Only the ones the address has, cleaned; an empty one is no value. */
export type Links = { comment?: string; hashtags?: string; source?: string }

/**
 * iD's `utilCleanOsmString`: trimmed, NFC, cut to 255 characters. iD cleans every value it writes to a tag.
 */
export function cleanTagValue(value: string): string {
  return Array.from(value.trim().normalize('NFC')).slice(0, TAG_VALUE_MAX).join('')
}

/**
 * iD's `hashtagRegex` (commit.js): a `#` (or the full-width `＃`) and the characters up to a space or
 * punctuation. Copied as it is, so the same words are hashtags as in iD.
 */
const HASHTAG = /([#＃][^ -⁯⸀-⹿\s\\'!"#$%()*,./:;<=>?@[\]^`{|}~]+)/g

/** The hashtags in a comment, with the URLs left out (iD's `commentHashtags`, #4289) */
export function hashtagsOfComment(comment: string): string[] {
  return comment.replace(/http\S*/g, '').match(HASHTAG) ?? []
}

/**
 * The hashtags of the `hashtags` value, separated by `,`, `;` or spaces. A word without `#` gets one; the first
 * hashtag of each word counts (iD's `hashtagHashtags`).
 */
export function hashtagsOfField(field: string): string[] {
  return field
    .split(/[,;\s]+/)
    .map((word) => {
      const tag = word[0] === '#' ? word : `#${word}`
      return tag.match(HASHTAG)?.[0]
    })
    .filter((tag): tag is string => tag !== undefined)
}

/**
 * The hashtags a draft ends with (iD's `findHashtags`). With `commentOnly` a comment that has hashtags replaces the
 * `hashtags` value; otherwise both count. Each tag once, compared without case, the first spelling kept.
 */
export function findHashtags(draft: Draft, commentOnly: boolean): string[] {
  let found = hashtagsOfComment(draft.comment)
  if (found.length === 0 || !commentOnly)
    found = [...found, ...hashtagsOfField(draft.hashtags ?? '')]
  const seen = new Set<string>()
  return found.filter((tag) => {
    const key = tag.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * The `hashtags` tag a draft gives, or `undefined` when it has none. The comment decides whether its hashtags alone
 * count: a comment that is not empty uses only its own hashtags (iD changes the comment with `commentOnly`).
 */
export function draftHashtags(draft: Draft): string | undefined {
  const found = findHashtags(draft, draft.comment !== '')
  return found.length > 0 ? cleanTagValue(found.join(';')) : undefined
}

/**
 * Whether a stored draft is too old or dated in the future (iD: `commentDate > currDate || currDate - commentDate > cutoff`).
 */
function expired(commentDate: number, now: number) {
  return commentDate > now || now - commentDate > DRAFT_TTL_MS
}

/**
 * The draft when the changeset starts (iD's `initChangeset`): the stored one unless it has expired, then each value
 * the link gives replaces the stored one and counts as a change now. When the comment has hashtags the stored
 * `hashtags` go (iD's `findHashtags` at start, #4304).
 */
export function prefillDraft(
  stored: StoredDraft | undefined,
  links: Links,
  now: number,
): StoredDraft {
  const live = stored !== undefined && !expired(stored.commentDate, now) ? stored : undefined
  const draft: StoredDraft = {
    comment: live?.comment ?? '',
    hashtags: live?.hashtags,
    source: live?.source,
    commentDate: live?.commentDate ?? 0,
  }
  if (links.comment !== undefined) {
    draft.comment = links.comment
    draft.commentDate = now
  }
  if (links.source !== undefined) {
    draft.source = links.source
    draft.commentDate = now
  }
  if (links.hashtags !== undefined) {
    draft.hashtags = links.hashtags
    draft.commentDate = now
  }
  if (hashtagsOfComment(draft.comment).length > 0) draft.hashtags = undefined
  return draft
}

/**
 * The draft as iD writes it when a field is left (`changeTags` without `onInput`): the values cleaned, the `hashtags`
 * recomputed from the comment, and an empty source gone.
 */
export function commitDraft(draft: Draft): Draft {
  const comment = cleanTagValue(draft.comment)
  const source = cleanTagValue(draft.source ?? '')
  const committed: Draft = { comment, source: source === '' ? undefined : source }
  const hashtags = draftHashtags({ comment, hashtags: draft.hashtags })
  if (hashtags !== undefined) committed.hashtags = hashtags
  return committed
}

/**
 * The values a link gives. The address's `comment`, `hashtags` and `source` are read as strings or null; a value
 * that is empty once cleaned counts as none (iD: `if (value)`).
 */
export function linksOf(params: {
  comment: string | null
  hashtags: string | null
  source: string | null
}): Links {
  const links: Links = {}
  const comment = params.comment === null ? '' : cleanTagValue(params.comment)
  const hashtags = params.hashtags === null ? '' : cleanTagValue(params.hashtags)
  const source = params.source === null ? '' : cleanTagValue(params.source)
  if (comment !== '') links.comment = comment
  if (hashtags !== '') links.hashtags = hashtags
  if (source !== '') links.source = source
  return links
}

const storedDraft = z.object({
  comment: z.string(),
  hashtags: z.string().optional(),
  source: z.string().optional(),
  commentDate: z.number(),
})

/** The stored draft from its JSON text. Anything that does not fit is no draft. */
export function parseStoredDraft(raw: string | null): StoredDraft | undefined {
  if (raw === null) return undefined
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return undefined
  }
  const parsed = storedDraft.safeParse(json)
  return parsed.success ? parsed.data : undefined
}
