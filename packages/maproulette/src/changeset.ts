/**
 * The changeset of an upload that resolves MapRoulette tasks: comment and source from the challenge's check-in
 * texts, the `#maproulette` hashtag, and the `closed:maproulette*` tags.
 */
import { replaceMustacheTags, mustacheContextFromTask } from './mustache.ts'
import type { MapRouletteChallenge } from './schema.ts'
import { TaskStatus } from './status.ts'

/** The hashtag every changeset with MapRoulette tasks gets */
export const MAPROULETTE_HASHTAG = '#maproulette'

/** The tag keys that this module owns; they are rewritten on every call */
export const CLOSED_TAG_KEYS = [
  'closed:maproulette',
  'closed:maproulette:already_fixed',
  'closed:maproulette:false_positive',
  'closed:maproulette:too_hard',
] as const

/** The changeset tag key for a status: Fixed (and any other) `closed:maproulette`, and one per other outcome */
export function closedTagKey(status: number): string {
  switch (Number(status)) {
    case TaskStatus.FalsePositive:
      return 'closed:maproulette:false_positive'
    case TaskStatus.AlreadyFixed:
      return 'closed:maproulette:already_fixed'
    case TaskStatus.TooHard:
      return 'closed:maproulette:too_hard'
    default:
      return 'closed:maproulette'
  }
}

/**
 * One comment from several check-in comments without a repeat, short enough for an OSM tag value (255). Joined by
 * newlines, else by `; `, else as many whole comments as fit; at last the first one cut.
 */
export function buildSuggestedComment(comments: Iterable<string>, maxChars = 255): string {
  const parts = [...new Set([...comments].map((c) => String(c || '').trim()).filter(Boolean))]
  if (!parts.length) return ''
  for (const sep of ['\n', '; ']) {
    const joined = parts.join(sep)
    if (joined.length <= maxChars) return joined
  }
  const kept: string[] = []
  for (const part of parts) {
    const candidate = kept.length ? `${kept.join('; ')}; ${part}` : part
    if (candidate.length > maxChars) break
    kept.push(part)
  }
  return kept.length ? kept.join('; ') : (parts[0] ?? '').slice(0, maxChars)
}

/** Task ids joined by `;`, whole ids only, without a repeat, within the limit */
export function joinTaskIds(ids: Iterable<string>, maxChars = 255): string {
  const parts: string[] = []
  for (const raw of ids) {
    const id = String(raw || '').trim()
    if (!id || parts.includes(id)) continue
    if ([...parts, id].join(';').length > maxChars) break
    parts.push(id)
  }
  return parts.join(';')
}

/** A task of the upload */
export type ChangesetTask = {
  taskId: string | number
  /** The status it is set to */
  status: number
  /** The challenge, when loaded: its check-in comment and source are used */
  challenge?: Pick<MapRouletteChallenge, 'checkinComment' | 'checkinSource'> | null
  /** The task (title, geometries, properties) for the `{{tags}}` of the check-in texts */
  task?: unknown
}

export type ChangesetTagsOptions = {
  /** The tags of the changeset so far */
  tags: Readonly<Record<string, string>>
  tasks: readonly ChangesetTask[]
  /** The longest tag value (255) */
  maxChars?: number
  /** The comment this function wrote last time: it may be replaced, a comment of the mapper may not */
  lastAutoComment?: string | null
  /** Clean a tag value (the default cuts it to `maxChars`) */
  cleanTagValue?: (value: string) => string
}

export type ChangesetTagsResult = {
  tags: Record<string, string>
  /** What to pass as `lastAutoComment` next time */
  autoComment: string | null
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The tags of the changeset with MapRoulette in them (the input is not changed):
 *   - `closed:maproulette*` rewritten from the tasks (task ids joined by `;`, one key per outcome)
 *   - `comment`: the check-in comments of the tasks' challenges with the tags replaced, set only while the comment
 *     is empty or still the last one written here
 *   - `source`: the check-in sources added to the list (separated by `;`)
 *   - `hashtags`: `#maproulette` added once
 * With no task nothing changes but the removal of the `closed:maproulette*` keys.
 */
export function applyMapRouletteChangesetTags(options: ChangesetTagsOptions): ChangesetTagsResult {
  const maxChars = options.maxChars ?? 255
  const clean = options.cleanTagValue ?? ((v: string) => v.slice(0, maxChars))
  const tags: Record<string, string> = { ...options.tags }
  for (const key of CLOSED_TAG_KEYS) delete tags[key]

  const comments = new Set<string>()
  const sources = new Set<string>()
  const idsByKey: Record<string, string[]> = {}
  for (const entry of options.tasks) {
    const taskId = String(entry.taskId)
    if (!taskId) continue
    const context = mustacheContextFromTask(entry.task)
    const comment = entry.challenge?.checkinComment
    const source = entry.challenge?.checkinSource
    if (comment) {
      const resolved = replaceMustacheTags(comment, context).trim()
      if (resolved) comments.add(resolved)
    }
    if (source) {
      const resolved = replaceMustacheTags(source, context).trim()
      if (resolved) sources.add(resolved)
    }
    const key = closedTagKey(entry.status)
    const ids = (idsByKey[key] ??= [])
    if (!ids.includes(taskId)) ids.push(taskId)
  }

  for (const key of Object.keys(idsByKey)) {
    const joined = joinTaskIds(idsByKey[key] ?? [], maxChars)
    if (joined) tags[key] = clean(joined)
  }

  let autoComment = options.lastAutoComment ?? null
  if (comments.size) {
    const suggested = buildSuggestedComment(comments, maxChars)
    const current = tags.comment ?? ''
    if (suggested && (!current.trim() || (autoComment !== null && current === autoComment))) {
      tags.comment = suggested
      autoComment = suggested
    }
  }
  if (sources.size) {
    tags.source = clean([...new Set([...splitList(tags.source), ...sources])].join(';'))
  }
  if (Object.keys(idsByKey).length) {
    tags.hashtags = clean(
      [...new Set([...splitList(tags.hashtags), MAPROULETTE_HASHTAG])].join(';'),
    )
  }
  return { tags, autoComment }
}
