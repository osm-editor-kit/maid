/**
 * Tasks earmarked "with save": the mapper decided an outcome, and MapRoulette hears about it only after the OSM
 * changeset is uploaded. The queue is a plain list that these functions replace, never change; the module that uses
 * it stores the JSON string where it wants (`serializeEarmarks`, `parseEarmarks`).
 */
import { z } from 'zod'
import type { MapRouletteClient } from './client.ts'
import { TaskStatus } from './status.ts'
import { asText } from './text.ts'

const text = z.preprocess((v) => (v === null || v === undefined ? '' : asText(v)), z.string())

/** An earmarked task. A row that is read from storage is made whole with defaults. */
export const earmarkSchema = z.object({
  taskId: z.union([z.string(), z.number()]).transform((v) => asText(v)),
  challengeId: text,
  parentName: text,
  title: text,
  elems: z.preprocess((v) => (Array.isArray(v) ? v.map(String) : []), z.array(z.string())),
  loc: z.preprocess(
    (v) => {
      if (!Array.isArray(v) || v.length < 2) return null
      const lng = Number(v[0])
      const lat = Number(v[1])
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
    },
    z.tuple([z.number(), z.number()]).nullable(),
  ),
  newComment: text,
  status: z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? TaskStatus.Fixed : v),
    z.coerce.number().int().finite(),
  ),
  /** Taken along with the next upload; the mapper can switch it off in the list */
  includeInUpload: z.preprocess((v) => (v === undefined ? true : !!v), z.boolean()),
  /** The task is already shown as done in this session (a status button, or accepting a tag fix) */
  localDone: z.boolean().optional(),
  completionResponses: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
})

export type Earmark = z.infer<typeof earmarkSchema>

/** The input of `earmark`: what is known; the rest gets defaults */
export type EarmarkInput = {
  taskId: string | number
  challengeId?: string | number
  parentName?: string
  title?: string
  elems?: readonly string[]
  loc?: readonly [number, number] | null
  newComment?: string
  /** Default Fixed */
  status?: number
  includeInUpload?: boolean
  localDone?: boolean
  completionResponses?: Record<string, string | boolean>
}

/** The queue: earmarks sorted by task id, one per task */
export type EarmarkQueue = readonly Earmark[]

/** An empty queue */
export const emptyEarmarks: EarmarkQueue = []

function sorted(list: readonly Earmark[]): Earmark[] {
  return [...list].sort((a, b) => a.taskId.localeCompare(b.taskId, 'en', { numeric: true }))
}

/** Normalise an input to an earmark; null when it has no task id. An empty comment is trimmed, empty responses are dropped. */
export function createEarmark(input: EarmarkInput): Earmark | null {
  const responses = input.completionResponses
  const parsed = earmarkSchema.safeParse({
    ...input,
    newComment: (input.newComment ?? '').trim(),
    completionResponses: responses && Object.keys(responses).length ? responses : undefined,
  })
  return parsed.success && parsed.data.taskId ? parsed.data : null
}

/** Add an earmark (it replaces one of the same task). Returns the queue unchanged for an input without task id. */
export function addEarmark(queue: EarmarkQueue, input: EarmarkInput): EarmarkQueue {
  const entry = createEarmark(input)
  if (!entry) return queue
  return sorted([...queue.filter((e) => e.taskId !== entry.taskId), entry])
}

/** Remove the earmark of a task: the undo of `addEarmark` */
export function removeEarmark(queue: EarmarkQueue, taskId: string | number): EarmarkQueue {
  return queue.filter((e) => e.taskId !== String(taskId))
}

/** The earmark of a task, if there is one */
export function findEarmark(queue: EarmarkQueue, taskId: string | number): Earmark | undefined {
  return queue.find((e) => e.taskId === String(taskId))
}

/** Whether a task is earmarked */
export function isEarmarked(queue: EarmarkQueue, taskId: string | number): boolean {
  return !!findEarmark(queue, taskId)
}

/** All earmarks, sorted by task id */
export function listEarmarks(queue: EarmarkQueue): Earmark[] {
  return sorted(queue)
}

/** The earmarks the mapper left checked for the next upload */
export function earmarksForUpload(queue: EarmarkQueue): Earmark[] {
  return sorted(queue).filter((e) => e.includeInUpload)
}

/** Check or uncheck a task for the next upload */
export function setEarmarkIncluded(
  queue: EarmarkQueue,
  taskId: string | number,
  included: boolean,
): EarmarkQueue {
  return queue.map((e) => (e.taskId === String(taskId) ? { ...e, includeInUpload: included } : e))
}

/**
 * Take the earmarks for an upload out of the queue. The unchecked ones stay for a later upload; the caller puts
 * the ones that fail to resolve back with `restoreEarmarks`.
 */
export function takeEarmarksForUpload(queue: EarmarkQueue): {
  taken: Earmark[]
  queue: EarmarkQueue
} {
  const taken = earmarksForUpload(queue)
  return { taken, queue: queue.filter((e) => !e.includeInUpload) }
}

/** Put earmarks back (failed ones of an upload). A row from before `localDone` existed counts as done locally. */
export function restoreEarmarks(queue: EarmarkQueue, list: readonly Earmark[]): EarmarkQueue {
  let next = queue
  for (const entry of list)
    next = addEarmark(next, { ...entry, localDone: entry.localDone ?? true })
  return next
}

/** The queue as a JSON string */
export function serializeEarmarks(queue: EarmarkQueue): string {
  return JSON.stringify(sorted(queue))
}

/** The queue from a JSON string; text that is not a list gives an empty queue, a bad row is dropped */
export function parseEarmarks(raw: string | null | undefined): EarmarkQueue {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: Earmark[] = []
  for (const row of data) {
    const parsed = earmarkSchema.safeParse(row)
    if (parsed.success && parsed.data.taskId) out.push(parsed.data)
  }
  return sorted(out)
}

/**
 * The comment that MapRoulette gets with the status: who resolved it, in which changeset, and the changeset's
 * comment quoted line by line.
 */
export function buildResolveComment(
  username: string,
  changesetUrl: string,
  changesetComment: string | undefined,
): string {
  const quote = String(changesetComment || '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `Resolved by ${username || 'unknown'} in changeset ${changesetUrl}\n\n${quote}`
}

export type ResolveAfterUploadOptions = {
  /** The id of the uploaded changeset */
  changesetId: string | number
  /** The page of the changeset, in the comment; the caller knows which OSM server it is */
  changesetUrl: string
  username: string
  /** The comment tag of the changeset, which is quoted */
  changesetComment?: string
  signal?: AbortSignal
  timeoutMs?: number
  /** Called before each task (`index` counts from 1) and once more with `done` at the end */
  onProgress?: (progress: { index: number; total: number; taskId?: string; done?: boolean }) => void
}

/** What happened to one earmark */
export type ResolveResult =
  | { taskId: string; ok: true }
  | { taskId: string; ok: false; error: unknown; earmark: Earmark }

export type ResolveAfterUploadSummary = {
  changesetId: string
  results: ResolveResult[]
  ok: number
  failed: number
  /** The earmarks that failed, for `restoreEarmarks` and a retry */
  failedEarmarks: Earmark[]
}

/**
 * After the upload: set each earmark's status on MapRoulette with the comment of `buildResolveComment`, one task
 * after the other. A failure does not stop the others; it is in the results with its earmark.
 */
export async function resolveAfterUpload(
  client: Pick<MapRouletteClient, 'setStatus'>,
  earmarks: readonly Earmark[],
  options: ResolveAfterUploadOptions,
): Promise<ResolveAfterUploadSummary> {
  const total = earmarks.length
  const comment = buildResolveComment(
    options.username,
    options.changesetUrl,
    options.changesetComment,
  )
  const results: ResolveResult[] = []
  for (const [i, earmark] of earmarks.entries()) {
    options.onProgress?.({ index: i + 1, total, taskId: earmark.taskId })
    try {
      await client.setStatus(earmark.taskId, earmark.status, {
        comment,
        ...(earmark.completionResponses && Object.keys(earmark.completionResponses).length
          ? { completionResponses: earmark.completionResponses }
          : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      })
      results.push({ taskId: earmark.taskId, ok: true })
    } catch (error) {
      results.push({ taskId: earmark.taskId, ok: false, error, earmark })
    }
  }
  options.onProgress?.({ index: total, total, done: true })
  const failedEarmarks = results.flatMap((r) => (r.ok ? [] : [r.earmark]))
  return {
    changesetId: String(options.changesetId),
    results,
    ok: results.length - failedEarmarks.length,
    failed: failedEarmarks.length,
    failedEarmarks,
  }
}
