// Ported from iD modules/util/clean_tags.ts (ISC, © iD contributors), at commit 0194f3926.
// iD runs this in its entity editor when a person changes tags; Maid runs it on the copy that is
// uploaded (toOsmChange), so the editor's own tags are not changed.

/** Tags as the editor holds them. `undefined` is a key that has no value and is dropped. */
export type TagsIn = Record<string, string | undefined>

/**
 * iD's discard list (`discarded.json` of id-tagging-schema): `true` drops the key, an object
 * drops the key only for the listed values.
 */
export type DiscardList = Record<string, boolean | Record<string, boolean>>

const KEEP_SPACES = /_hours|_times|:conditional$/
const SKIP = /^(description|note|fixme|inscription)(:.+)?$/
const ZERO_WIDTH = /[​-‏﻿]/g

function cleanValue(key: string, value: string): string {
  // free text is kept as the person typed it
  if (SKIP.test(key)) return value

  // `;`-separated lists lose the spaces around each item; opening hours keep a space after `;`
  const joiner = KEEP_SPACES.test(key) ? '; ' : ';'
  let cleaned = value
    .split(';')
    .map((part) => part.trim())
    .join(joiner)

  // websites and emails: only obvious copy-paste errors (iD #2323), not validation
  if (key.includes('website') || key.includes('email') || cleaned.startsWith('http')) {
    cleaned = cleaned.replace(ZERO_WIDTH, '')
  }
  return cleaned
}

/**
 * iD's `utilCleanTags`: a copy of the tags with the empty key and the undefined values dropped,
 * and each value cleaned as above. Empty strings are kept here, as in iD; they are dropped by
 * `discardTags`.
 */
export function cleanTags(tags: TagsIn): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(tags)) {
    if (!key) continue
    const value = tags[key]
    if (value !== undefined) out[key] = cleanValue(key, value)
  }
  return out
}

/**
 * The part of iD's `actionDiscardTags` that decides which tags are not uploaded: a key with an
 * empty value, and a key on the discard list (for all values with `true`, for listed values only
 * with an object). iD applies it to created and modified elements before the upload.
 */
export function discardTags(
  tags: Record<string, string>,
  discarded: DiscardList = {},
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(tags)) {
    const value = tags[key]!
    const rule = discarded[key]
    const listed = typeof rule === 'object' && Boolean(rule[value])
    if (!value || rule === true || listed) continue
    out[key] = value
  }
  return out
}
