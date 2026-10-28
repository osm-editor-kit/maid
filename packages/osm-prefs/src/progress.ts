/**
 * One list's progress kept in the user's OSM preferences, written so that a crash never loses the last
 * committed state. Each list has a meta key (the commit point, at most 255 characters of JSON) and chunk
 * keys in one of two slots, `a` or `b`. A save writes the inactive slot, then the meta, then removes the
 * old chunks. The meta names the active slot, so until the meta is written the old state stays readable.
 *
 * Keys: `<prefix>.<listKey>` (the meta) and `<prefix>.<listKey>.<slot>.<index>` (a chunk). Nothing else is
 * written, and no function touches a key outside the prefix.
 */
import { splitValue } from './chunks.ts'
import { decodeStatuses, encodeStatuses, type TaskStatus } from './codec.ts'
import { PREF_LIMITS, type PrefsTransport } from './transport.ts'

/** The key prefix when none is given. Each app with its own progress can use its own prefix. */
export const DEFAULT_PREFIX = 'maid.tasks'

/** The meta format version. A reader refuses any other. */
const META_VERSION = 1

const DAY_SECONDS = 86_400
const LIST_KEY = /^[0-9a-z]{8}$/
const CHUNK_SUFFIX = /^[ab]\.\d+$/

/** One of the two slots a list's chunks can be in. */
export type Slot = 'a' | 'b'

/**
 * The meta of one list. The short field names keep it within 255 characters.
 * `v` format version, `s` active slot, `n` chunk count, `c` task count, `r` revision (+1 per save),
 * `u` time of the save in unix seconds, `h` the order hash of the task ids (8 characters), `g` the generation:
 * 8 random characters set when the list is first saved and kept by every later save. A list that was removed and
 * saved again has another generation, so its new revisions are not mistaken for old ones; a meta without `g` reads
 * as `''`.
 */
export type ListMeta = {
  v: 1
  s: Slot
  n: number
  c: number
  r: number
  u: number
  h: string
  g: string
}

/** A list found by `listAll`: its key (8 characters) and its meta. */
export type ListEntry = { listKey: string; meta: ListMeta }

/** The result of `listAll`. `broken` holds the full key of each meta that does not parse. */
export type ListAllResult = { lists: ListEntry[]; broken: string[] }

/** The result of `load`: the meta and the decoded statuses, in the order the caller saved them. */
export type LoadedProgress = { meta: ListMeta; statuses: TaskStatus[] }

/** Options of `save`. */
export type SaveOptions = {
  /** The hash of the task ids in their order: `orderHashOf(taskIds)`. Kept in the meta. */
  orderHash: string
  /**
   * The preferences as `list()` returned them a moment before this save. Used for the meta, the chunks and
   * the cleanup. A record older than the server's state can overwrite the active slot: fetch it just before.
   * Left out, `save` lists the preferences itself.
   */
  previous?: Record<string, string>
}

/** Options of `createProgressStore`. */
export type ProgressStoreOptions = {
  transport: PrefsTransport
  /** The key prefix. Default `maid.tasks`. */
  prefix?: string
  /** Epoch milliseconds, for the meta's `u`. Default `Date.now`. */
  now?: () => number
  /** The generation of a new list (8 characters of base 36). Default: random from `crypto.getRandomValues`. */
  generation?: () => string
}

/** The progress store: every function takes a listKey from `listKeyOf`. */
export type ProgressStore = {
  /** Every list under the prefix, from one `list()` call. Metas that do not parse are reported in `broken`. */
  listAll(): Promise<ListAllResult>
  /** The meta and statuses of one list, or undefined when it has no meta. Throws when the stored data is broken. */
  load(listKey: string, all?: Record<string, string>): Promise<LoadedProgress | undefined>
  /** Saves all statuses of one list, crash-safe. Returns the new meta. */
  save(listKey: string, statuses: readonly TaskStatus[], options: SaveOptions): Promise<ListMeta>
  /** Deletes the chunks, then the meta, of one list. Other keys are not touched. */
  remove(listKey: string, all?: Record<string, string>): Promise<void>
}

/** The 8-character key of a list, from its id: FNV-1a (32 bits) of the id, in base 36. */
export function listKeyOf(listId: string): string {
  return eightBase36(fnv1a(listId))
}

/** The 8-character hash of task ids in their order, for the meta's `h`. */
export function orderHashOf(taskIds: readonly string[]): string {
  return eightBase36(fnv1a(JSON.stringify(taskIds)))
}

/**
 * Turns a meta into its JSON text, in the field order of the format. Throws when a field is out of range,
 * or when the text would be longer than 255 characters (with these fields it cannot be, but the check stays).
 */
export function formatMeta(meta: ListMeta): string {
  const checked = asMeta(meta)
  const text = JSON.stringify(checked)
  if (text.length > PREF_LIMITS.valueMax)
    throw new RangeError(
      `The meta is ${text.length} characters, the limit is ${PREF_LIMITS.valueMax}`,
    )
  return text
}

/** Reads a meta from its JSON text. Throws for anything that is not a valid meta. */
export function parseMeta(text: string): ListMeta {
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    throw new Error('The meta is not JSON')
  }
  return asMeta(data)
}

/**
 * Entries whose last save (`u`) is older than `days` before `nowSeconds`. Used to find lists nobody has
 * touched for a while; they can be removed with `remove`.
 */
export function staleLists(
  entries: readonly ListEntry[],
  nowSeconds: number,
  days = 30,
): ListEntry[] {
  const cutoff = nowSeconds - days * DAY_SECONDS
  return entries.filter((entry) => entry.meta.u < cutoff)
}

/** What to do with one list: `push`, `pull`, `conflict` or `same`. */
export type SyncAction = 'push' | 'pull' | 'conflict' | 'same'

/** The last state both sides agreed on, and the local revision */
export type SyncRevisions = {
  localRevision: number
  ackedRevision: number
  /** The generation of the agreed state; undefined when this side never agreed with the server */
  ackedGeneration?: string
}

/**
 * Whether the server's meta is past the agreed state: a higher revision, or another generation (the list was
 * removed and saved again, or it is another account's list). Undefined `remote` (no meta) is never past it.
 */
export function remoteChanged(
  revisions: Pick<SyncRevisions, 'ackedRevision' | 'ackedGeneration'>,
  remote: Pick<ListMeta, 'r' | 'g'> | undefined,
): boolean {
  if (remote === undefined) return false
  if (revisions.ackedGeneration !== undefined && remote.g !== revisions.ackedGeneration) return true
  return remote.r > revisions.ackedRevision
}

/**
 * Decides what to do with one list. `localRevision` is the revision of the local state, `ackedRevision` and
 * `ackedGeneration` the last state both sides agreed on, and `remote` the server's meta (undefined when the
 * server has no meta). Local changes are those above `ackedRevision`; remote ones are told by `remoteChanged`.
 *
 * | local changed | remote changed | result     | meaning                              |
 * | ------------- | -------------- | ---------- | ------------------------------------ |
 * | no            | no             | `same`     | nothing to do                        |
 * | yes           | no             | `push`     | write the local state                |
 * | no            | yes            | `pull`     | take the remote state                |
 * | yes           | yes            | `conflict` | both changed: the caller decides     |
 */
export function reconcile(
  revisions: SyncRevisions,
  remote: Pick<ListMeta, 'r' | 'g'> | undefined,
): SyncAction {
  const localChanged = revisions.localRevision > revisions.ackedRevision
  const changed = remoteChanged(revisions, remote)
  if (localChanged && changed) return 'conflict'
  if (localChanged) return 'push'
  if (changed) return 'pull'
  return 'same'
}

/** Creates the progress store over a transport. */
export function createProgressStore(options: ProgressStoreOptions): ProgressStore {
  const { transport } = options
  const prefix = options.prefix ?? DEFAULT_PREFIX
  const now = options.now ?? Date.now
  const generation = options.generation ?? randomGeneration
  const listPrefix = `${prefix}.`

  const metaKeyOf = (listKey: string): string => `${prefix}.${listKey}`
  const chunkKeyOf = (listKey: string, slot: Slot, index: number): string =>
    `${prefix}.${listKey}.${slot}.${index}`
  const isChunkOf = (key: string, listKey: string): boolean =>
    key.startsWith(`${metaKeyOf(listKey)}.`) &&
    CHUNK_SUFFIX.test(key.slice(metaKeyOf(listKey).length + 1))

  return {
    async listAll() {
      const record = await transport.list()
      const lists: ListEntry[] = []
      const broken: string[] = []
      for (const [key, value] of Object.entries(record)) {
        if (!key.startsWith(listPrefix)) continue
        const listKey = key.slice(listPrefix.length)
        // chunk keys have more dots after the list key, so they are not metas
        if (!LIST_KEY.test(listKey)) continue
        try {
          lists.push({ listKey, meta: parseMeta(value) })
        } catch {
          broken.push(key)
        }
      }
      return { lists, broken }
    },

    async load(listKey, all) {
      const record = all ?? (await transport.list())
      const metaText = record[metaKeyOf(listKey)]
      if (metaText === undefined) return undefined
      const meta = parseMeta(metaText)
      const parts: string[] = []
      for (let index = 0; index < meta.n; index++) {
        const piece = record[chunkKeyOf(listKey, meta.s, index)]
        if (piece === undefined) throw new Error(`Chunk ${index} of list ${listKey} is missing`)
        parts.push(piece)
      }
      return { meta, statuses: await decodeStatuses(parts.join(''), meta.c) }
    },

    async save(listKey, statuses, saveOptions) {
      const all = saveOptions.previous ?? (await transport.list())
      const metaKey = metaKeyOf(listKey)
      let current: ListMeta | undefined
      try {
        current = all[metaKey] === undefined ? undefined : parseMeta(all[metaKey])
      } catch {
        throw new Error(
          `The meta of list ${listKey} is broken; remove the list before saving it again`,
        )
      }
      // the inactive slot takes the new chunks; the first save of a list uses slot a
      const slot: Slot = current?.s === 'a' ? 'b' : 'a'
      const pieces = splitValue(await encodeStatuses(statuses))
      const meta: ListMeta = {
        v: META_VERSION,
        s: slot,
        n: pieces.length,
        c: statuses.length,
        r: (current?.r ?? 0) + 1,
        u: Math.floor(now() / 1000),
        h: saveOptions.orderHash,
        // a new list, or one saved before generations: a new one
        g: current?.g || generation(),
      }
      // checks the whole meta before anything is written
      const metaText = formatMeta(meta)
      const chunks = pieces.map((value, index) => ({
        key: chunkKeyOf(listKey, slot, index),
        value,
      }))

      // 1. the inactive slot; a chunk already holding this text is not written again
      for (const chunk of chunks) {
        if (all[chunk.key] !== chunk.value) await transport.set(chunk.key, chunk.value)
      }
      // 2. the commit point: from here on the new state is the saved one
      await transport.set(metaKey, metaText)
      // 3. the old slot, and chunks left over from a longer save
      const keep = new Set(chunks.map((chunk) => chunk.key))
      for (const key of Object.keys(all)) {
        if (isChunkOf(key, listKey) && !keep.has(key)) await transport.remove(key)
      }
      return meta
    },

    async remove(listKey, all) {
      const record = all ?? (await transport.list())
      // chunks first, the meta last: a failure in between leaves a list that listAll still finds
      for (const key of Object.keys(record)) {
        if (isChunkOf(key, listKey)) await transport.remove(key)
      }
      if (record[metaKeyOf(listKey)] !== undefined) await transport.remove(metaKeyOf(listKey))
    },
  }
}

/** Checks a value of the meta shape and returns it with its fields in the format's order. Throws when a field is wrong. */
function asMeta(value: unknown): ListMeta {
  if (typeof value !== 'object' || value === null) throw new Error('The meta is not an object')
  const { v, s, n, c, r, u, h, g = '' } = value as Record<string, unknown>
  if (v !== META_VERSION)
    throw new Error(`The meta version is ${String(v)}, expected ${META_VERSION}`)
  if (s !== 'a' && s !== 'b') throw new Error('The meta slot is not a or b')
  if (typeof h !== 'string' || !LIST_KEY.test(h))
    throw new Error('The meta order hash is not 8 characters of base 36')
  if (typeof g !== 'string' || (g !== '' && !LIST_KEY.test(g)))
    throw new Error('The meta generation is not 8 characters of base 36')
  return {
    v: META_VERSION,
    s,
    n: wholeNumber(n, 'n'),
    c: wholeNumber(c, 'c'),
    r: wholeNumber(r, 'r'),
    u: wholeNumber(u, 'u'),
    h,
    g,
  }
}

/** A non-negative safe integer from a meta field. */
function wholeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`The meta field ${field} is not a whole number`)
  }
  return value
}

/** FNV-1a, 32 bits, over the UTF-16 code units of the text. Returns an unsigned number. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 8 random characters of base 36, for a new list's generation */
function randomGeneration(): string {
  const [value = 0] = globalThis.crypto.getRandomValues(new Uint32Array(1))
  return eightBase36(value)
}

/** A number in base 36, padded with zeros to 8 characters (a 32-bit value needs at most 7). */
function eightBase36(value: number): string {
  return value.toString(36).padStart(8, '0')
}
