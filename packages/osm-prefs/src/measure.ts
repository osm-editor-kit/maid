/**
 * Measures what the store writes for a list of a given size, by running a real save into an in-memory
 * transport. The numbers come from the same code the app runs, not from a formula.
 */
import { TASK_STATUSES, type TaskStatus } from './codec.ts'
import {
  createProgressStore,
  DEFAULT_PREFIX,
  listKeyOf,
  orderHashOf,
  parseMeta,
} from './progress.ts'
import { memoryTransport } from './transport.ts'

/** The status patterns the measurement uses. */
export type StatusPattern = 'all-open' | 'ten-percent-done' | 'random'

/** The three patterns, in the order the report lists them. */
export const STATUS_PATTERNS: readonly StatusPattern[] = ['all-open', 'ten-percent-done', 'random']

/** The result of `measure`. Character counts include the keys. */
export type Measurement = {
  count: number
  pattern: StatusPattern
  /** `b` (plain) or `z` (deflated): the encoding the codec chose. */
  encoding: 'b' | 'z'
  /** Chunk keys written (the meta is one more key). */
  chunks: number
  /** Keys of the list, the meta included. */
  keys: number
  /** Characters of the meta value. */
  metaChars: number
  /** Characters of all chunk values together. */
  chunkChars: number
  /** Characters of all keys of the list, the meta included. */
  keyChars: number
  /** `keyChars` plus all values (meta and chunks). */
  totalChars: number
}

/** The fixed time of the measurement, so that the meta is the same on every run. */
const FIXED_NOW_MS = 1_700_000_000_000

/**
 * Statuses for `count` tasks in one of the patterns: every task open; a tenth done at random places (the
 * rest open); or each task one of the four statuses at random. The seed makes the random ones repeatable.
 */
export function sampleStatuses(count: number, pattern: StatusPattern, seed = 1): TaskStatus[] {
  const next = prng(seed)
  if (pattern === 'random') {
    return Array.from(
      { length: count },
      () => TASK_STATUSES[Math.floor(next() * TASK_STATUSES.length)] ?? 'open',
    )
  }
  const done = new Set<number>()
  if (pattern === 'ten-percent-done') {
    const target = Math.round(count / 10)
    while (done.size < target) done.add(Math.floor(next() * count))
  }
  return Array.from({ length: count }, (_, index) => (done.has(index) ? 'done' : 'open'))
}

/** Saves `count` tasks of one pattern into memory and counts what the store wrote. */
export async function measure(
  count: number,
  pattern: StatusPattern,
  seed = 1,
): Promise<Measurement> {
  const transport = memoryTransport()
  const store = createProgressStore({ transport, now: () => FIXED_NOW_MS })
  const listKey = listKeyOf('size-report')
  const taskIds = Array.from({ length: count }, (_, index) => `task-${index}`)
  const meta = await store.save(listKey, sampleStatuses(count, pattern, seed), {
    orderHash: orderHashOf(taskIds),
  })

  const record = await transport.list()
  const base = `${DEFAULT_PREFIX}.${listKey}`
  const listEntries = Object.entries(record).filter(
    ([key]) => key === base || key.startsWith(`${base}.`),
  )
  const chunkEntries = listEntries.filter(([key]) => key !== base)
  const metaText = record[base] ?? ''
  // the meta must read back as the store reports it
  if (parseMeta(metaText).r !== meta.r)
    throw new Error('The stored meta does not match the saved one')
  const encoding = chunkValuesInOrder(chunkEntries, meta.s).join('').charAt(0)
  if (encoding !== 'b' && encoding !== 'z') throw new Error(`Unexpected encoding "${encoding}"`)

  const keyChars = listEntries.reduce((sum, [key]) => sum + key.length, 0)
  const chunkChars = chunkEntries.reduce((sum, [, value]) => sum + value.length, 0)
  return {
    count,
    pattern,
    encoding,
    chunks: chunkEntries.length,
    keys: listEntries.length,
    metaChars: metaText.length,
    chunkChars,
    keyChars,
    totalChars: keyChars + chunkChars + metaText.length,
  }
}

/** The chunk values of one slot, sorted by their index. */
function chunkValuesInOrder(entries: [string, string][], slot: 'a' | 'b'): string[] {
  const marker = `.${slot}.`
  return entries
    .map(([key, value]) => ({ key, value }))
    .filter(({ key }) => key.includes(marker))
    .sort((left, right) => indexOf(left.key) - indexOf(right.key))
    .map(({ value }) => value)
}

/** The index at the end of a chunk key. */
function indexOf(key: string): number {
  return Number(key.slice(key.lastIndexOf('.') + 1))
}

/** mulberry32: a small seeded generator, the same numbers in every runtime. */
function prng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
