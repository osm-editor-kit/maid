/**
 * The tag fix of a cooperative challenge (`cooperativeWork.meta.type` 1): `modifyElement` operations with
 * `setTags` and `unsetTags` children, as a list of options that a UI shows as a tag diff and applies. OSC change
 * files (type 2) are not read.
 *
 * @see https://learn.maproulette.org/en-US/documentation/creating-cooperative-challenges/
 */
import { collectOsmEntityIds } from './osm-ids.ts'
import { cooperativeWorkSchema, type MapRouletteCooperativeWork } from './schema.ts'
import { asText } from './text.ts'

/** What to do to the tags of one entity: keys to set (values as text) and keys to remove */
export type EntityTagChange = {
  /** The entity id in the short form, `w123` */
  entityId: string
  set: Record<string, string>
  unset: string[]
}

/** One way to fix a task. Today a task has one option; `id` and `label` are there for several. */
export type TagFixOption = {
  id: string
  label?: string
  operations: EntityTagChange[]
}

/** How a key differs between the tags before and after a change */
export type TagDiffRow = {
  key: string
  before?: string
  after?: string
  kind: 'added' | 'changed' | 'removed' | 'unchanged'
}

/** The id of the one option of a tag fix */
export const DEFAULT_TAG_FIX_OPTION_ID = 'default'

type Bag = Record<string, unknown>

function isBag(value: unknown): value is Bag {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The cooperative work of a task: at the top, or under `geometries`; null when absent or not an object */
export function extractCooperativeWork(task: unknown): MapRouletteCooperativeWork | null {
  if (!isBag(task)) return null
  const geometries = isBag(task.geometries) ? task.geometries : undefined
  const candidate = task.cooperativeWork ?? geometries?.cooperativeWork
  const parsed = cooperativeWorkSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function modifyElementOps(
  work: MapRouletteCooperativeWork,
): { id: string; operations: unknown[] }[] {
  const out: { id: string; operations: unknown[] }[] = []
  for (const op of work.operations ?? []) {
    if (!isBag(op) || op.operationType !== 'modifyElement' || !isBag(op.data)) continue
    const id = op.data.id
    if (typeof id !== 'string' && typeof id !== 'number') continue
    out.push({
      id: String(id),
      operations: Array.isArray(op.data.operations) ? op.data.operations : [],
    })
  }
  return out
}

/** A tag fix: type 1, or an older cooperative work (version 1, or no type) with a `modifyElement` operation */
export function isTagFixWork(work: MapRouletteCooperativeWork | null): boolean {
  if (!work) return false
  const type = work.meta?.type
  if (type === 2) return false
  if (type === 1) return true
  if (work.meta?.version === 1 || (type === undefined && Array.isArray(work.operations))) {
    return modifyElementOps(work).length > 0
  }
  return false
}

/** Whether the task carries a tag fix */
export function isTagFix(task: unknown): boolean {
  return isTagFixWork(extractCooperativeWork(task))
}

/** The entity id (`w123`) of a MapRoulette element id (`way/123`, `w123`, `123` is none) */
export function parseElementId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  return collectOsmEntityIds(asText(raw))[0] ?? null
}

function applyChild(change: EntityTagChange, child: unknown): void {
  if (!isBag(child)) return
  const op = child.operation ?? child.operationType
  if (op === 'setTags' && isBag(child.data)) {
    for (const [key, value] of Object.entries(child.data)) {
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
        continue
      change.set[key] = String(value)
      change.unset = change.unset.filter((k) => k !== key)
    }
  } else if (op === 'unsetTags' && Array.isArray(child.data)) {
    for (const raw of child.data) {
      if (typeof raw !== 'string' && typeof raw !== 'number') continue
      const key = String(raw)
      if (!key) continue
      delete change.set[key]
      if (!change.unset.includes(key)) change.unset.push(key)
    }
  }
}

/**
 * The tag fix of a task as options. [] when the task has no tag fix or no usable operation; otherwise one option
 * with an operation per entity (several `modifyElement` blocks of one entity are merged in order; ids that are
 * not OSM ids are skipped).
 */
export function tagFixOptions(task: unknown): TagFixOption[] {
  const work = extractCooperativeWork(task)
  if (!work || !isTagFixWork(work)) return []
  const byId = new Map<string, EntityTagChange>()
  for (const op of modifyElementOps(work)) {
    const entityId = parseElementId(op.id)
    if (!entityId) continue
    let change = byId.get(entityId)
    if (!change) {
      change = { entityId, set: {}, unset: [] }
      byId.set(entityId, change)
    }
    for (const child of op.operations) applyChild(change, child)
  }
  if (!byId.size) return []
  return [{ id: DEFAULT_TAG_FIX_OPTION_ID, operations: [...byId.values()] }]
}

/** The tags after a change: keys set, keys removed. The input is not changed. */
export function applyTagChange(
  tags: Record<string, string> | null | undefined,
  change: Pick<EntityTagChange, 'set' | 'unset'>,
): Record<string, string> {
  const next = { ...tags, ...change.set }
  for (const key of change.unset) delete next[key]
  return next
}

/** The diff of a change on the current tags: one row per key that is in the tags or the change, sorted by key */
export function diffTagChange(
  tags: Record<string, string> | null | undefined,
  change: Pick<EntityTagChange, 'set' | 'unset'>,
): TagDiffRow[] {
  const before = tags ?? {}
  const after = applyTagChange(before, change)
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return keys.map((key): TagDiffRow => {
    const b = before[key]
    const a = after[key]
    const row: TagDiffRow = { key, kind: 'unchanged' }
    if (b !== undefined) row.before = b
    if (a !== undefined) row.after = a
    row.kind =
      b === undefined ? 'added' : a === undefined ? 'removed' : a === b ? 'unchanged' : 'changed'
    return row
  })
}

/** The entities that an option changes and that the caller has: `entityId` and the tags after the change */
export function resolveTagFix(
  option: TagFixOption,
  getTags: (entityId: string) => Record<string, string> | null | undefined,
): {
  matched: {
    entityId: string
    before: Record<string, string>
    after: Record<string, string>
  }[]
  unmatched: string[]
} {
  const matched: {
    entityId: string
    before: Record<string, string>
    after: Record<string, string>
  }[] = []
  const unmatched: string[] = []
  for (const change of option.operations) {
    const tags = getTags(change.entityId)
    if (!tags) {
      unmatched.push(change.entityId)
      continue
    }
    matched.push({
      entityId: change.entityId,
      before: { ...tags },
      after: applyTagChange(tags, change),
    })
  }
  return { matched, unmatched }
}
