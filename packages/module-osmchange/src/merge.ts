/**
 * The three-way merge of one element: the file's state ("ours"), the server's current state ("theirs") and the version
 * the file was made from ("base"). The rules (docs/research/osmchange-upload/README.md):
 *
 * - Tags per key, as StreetComplete's StringMapEntryChange: only the file changed a key → the file; only the server
 *   → the server; both to the same value → fine; both differently → a decision. Without a base every key that
 *   differs is a decision.
 * - A node's position: one side moved it → that side; both moved it less than 3 m apart → the file, with a note
 *   (Tobias, 2026-10-23); further apart → a decision.
 * - A way's nodes: one side changed them → that side; both → diff3 as iD's actionMergeRemoteChanges, a decision when
 *   the changes overlap. A relation's members: one side → that side; both differently → a decision.
 * - A delete: deleted on the server already → nothing to do; changed on the server since, or still used → a decision,
 *   "keep" chosen at first (Tobias, 2026-10-23).
 *
 * Pure: every decision comes in as `choices`, so the plan is recomputed from the same inputs after each choice.
 */
import deepEqual from 'fast-deep-equal'
import { diff3Merge } from 'node-diff3'
import type { Duplicate } from './match.ts'
import {
  keyOf,
  type FileChange,
  type Message,
  type OsmElement,
  type ServerState,
  type Tags,
} from './types.ts'

/** Both sides moved a node: closer together than this, in metres, and the file's position is taken */
export const CLOSE_METRES = 3

export type Choice = 'file' | 'current'

export type Conflict =
  | {
      readonly id: string
      readonly kind: 'tag'
      readonly key: string
      readonly base?: string
      readonly file?: string
      readonly current?: string
    }
  | { readonly id: string; readonly kind: 'position'; readonly metres: number }
  | { readonly id: string; readonly kind: 'nodes' }
  | { readonly id: string; readonly kind: 'members' }
  | {
      readonly id: string
      readonly kind: 'delete'
      /** Changed on the server since the file's version */
      readonly changed: boolean
      /** The ways and relations that still use it and that the file does not change to let go of it */
      readonly usedBy: readonly string[]
      readonly default: Choice
    }
  | {
      readonly id: string
      readonly kind: 'duplicate'
      /** The existing elements nearby with the same main tag, added since the file's element was made */
      readonly candidates: readonly Duplicate[]
    }

/**
 * - `clean`: the server has the file's version; the change applies as it is.
 * - `auto`: the server changed it since, and the merge needed no decision (the notes say what was done).
 * - `decide`: at least one conflict.
 * - `skip`: nothing to apply (already deleted, deleted on the server, already on the server).
 */
export type Status = 'clean' | 'auto' | 'decide' | 'skip'

export type Merged = {
  readonly status: Status
  readonly conflicts: readonly Conflict[]
  readonly notes: readonly Message[]
  /**
   * What to write: the element with every decision applied, `'delete'`, or undefined for nothing. Undefined too while
   * a conflict has no choice.
   */
  readonly result: OsmElement | 'delete' | undefined
}

const EARTH_RADIUS = 6_371_008.8

/** Metres between two positions (haversine) */
export function metresBetween(
  a: { lat?: number; lon?: number },
  b: { lat?: number; lon?: number },
) {
  const rad = Math.PI / 180
  const dLat = ((b.lat ?? 0) - (a.lat ?? 0)) * rad
  const dLon = ((b.lon ?? 0) - (a.lon ?? 0)) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat ?? 0) * rad) * Math.cos((b.lat ?? 0) * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

function samePosition(a: OsmElement, b: OsmElement) {
  return (
    Math.abs((a.lat ?? 0) - (b.lat ?? 0)) < 1e-7 && Math.abs((a.lon ?? 0) - (b.lon ?? 0)) < 1e-7
  )
}

/** Whether a conflict has a choice: its own, or the one it starts with */
export function choiceOf(
  conflict: Conflict,
  choices: Readonly<Record<string, Choice>>,
): Choice | undefined {
  return choices[conflict.id] ?? (conflict.kind === 'delete' ? conflict.default : undefined)
}

type Part<T> = { value: T | undefined; conflicts: Conflict[]; notes: Message[] }

function mergeTags(
  key: string,
  base: Tags | undefined,
  ours: Tags,
  theirs: Tags,
  choices: Readonly<Record<string, Choice>>,
): Part<Tags> {
  const tags: Record<string, string> = {}
  const conflicts: Conflict[] = []
  const kept: string[] = []
  let open = false
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    const o = ours[k]
    const t = theirs[k]
    let value: string | undefined
    if (o === t) value = o
    else if (base && o === base[k]) {
      value = t
      kept.push(k)
    } else if (base && t === base[k]) value = o
    else {
      const conflict: Conflict = {
        id: `${key}:tag:${k}`,
        kind: 'tag',
        key: k,
        ...(base?.[k] !== undefined ? { base: base[k] } : {}),
        ...(o !== undefined ? { file: o } : {}),
        ...(t !== undefined ? { current: t } : {}),
      }
      conflicts.push(conflict)
      const choice = choices[conflict.id]
      if (choice === undefined) open = true
      value = choice === 'file' ? o : t
    }
    if (value !== undefined) tags[k] = value
  }
  const notes: Message[] =
    kept.length > 0
      ? [{ id: 'osmchange_note_server_tags', values: { keys: kept.sort().join(', ') } }]
      : []
  return { value: open ? undefined : tags, conflicts, notes }
}

/** A one-sided change is taken; changes on both sides go to `both` */
function oneSided<T>(
  base: T | undefined,
  ours: T,
  theirs: T,
  serverNote: Message,
  both: () => Part<T>,
): Part<T> {
  if (deepEqual(ours, theirs)) return { value: ours, conflicts: [], notes: [] }
  if (base !== undefined && deepEqual(ours, base))
    return { value: theirs, conflicts: [], notes: [serverNote] }
  if (base !== undefined && deepEqual(theirs, base))
    return { value: ours, conflicts: [], notes: [] }
  return both()
}

function decided<T>(
  conflict: Conflict,
  ours: T,
  theirs: T,
  choices: Readonly<Record<string, Choice>>,
): Part<T> {
  const choice = choices[conflict.id]
  return {
    value: choice === undefined ? undefined : choice === 'file' ? ours : theirs,
    conflicts: [conflict],
    notes: [],
  }
}

function mergePosition(
  key: string,
  base: OsmElement | undefined,
  ours: OsmElement,
  theirs: OsmElement,
  choices: Readonly<Record<string, Choice>>,
) {
  const position = (element: OsmElement) => ({ lat: element.lat, lon: element.lon })
  if (samePosition(ours, theirs)) return { value: position(ours), conflicts: [], notes: [] }
  if (base && samePosition(ours, base))
    return {
      value: position(theirs),
      conflicts: [],
      notes: [
        {
          id: 'osmchange_note_server_moved',
          values: { metres: round(metresBetween(base, theirs)) },
        },
      ],
    }
  if (base && samePosition(theirs, base)) return { value: position(ours), conflicts: [], notes: [] }
  const metres = metresBetween(ours, theirs)
  if (metres < CLOSE_METRES)
    return {
      value: position(ours),
      conflicts: [],
      notes: [{ id: 'osmchange_note_moved_close', values: { metres: round(metres) } }],
    }
  return decided<{ lat?: number; lon?: number }>(
    { id: `${key}:position`, kind: 'position', metres: round(metres) },
    position(ours),
    position(theirs),
    choices,
  )
}

function round(metres: number) {
  return Math.round(metres * 10) / 10
}

function mergeNodes(
  key: string,
  base: readonly number[] | undefined,
  ours: readonly number[],
  theirs: readonly number[],
  choices: Readonly<Record<string, Choice>>,
): Part<readonly number[]> {
  return oneSided(base, ours, theirs, { id: 'osmchange_note_server_nodes' }, () => {
    if (base) {
      const nodes: number[] = []
      let clean = true
      for (const hunk of diff3Merge([...ours], [...base], [...theirs], {
        excludeFalseConflicts: true,
      })) {
        if (hunk.ok) nodes.push(...hunk.ok)
        else if (hunk.conflict) {
          const { a, o, b } = hunk.conflict
          if (deepEqual(o, a)) nodes.push(...b)
          else if (deepEqual(o, b)) nodes.push(...a)
          else clean = false
        }
      }
      if (clean)
        return { value: nodes, conflicts: [], notes: [{ id: 'osmchange_note_nodes_merged' }] }
    }
    return decided({ id: `${key}:nodes`, kind: 'nodes' }, ours, theirs, choices)
  })
}

/**
 * Merges one change of the file with what the server has. `usedBy` are the ways and relations that still use an
 * element the file deletes (see plan.ts); it is only read for a delete.
 */
export function mergeChange(
  change: FileChange,
  server: ServerState | undefined,
  choices: Readonly<Record<string, Choice>>,
  usedBy: readonly string[] = [],
): Merged {
  const ours = change.element
  const key = keyOf(ours.type, ours.id)
  if (change.action === 'create' || !server)
    return { status: 'clean', conflicts: [], notes: [], result: ours }
  const { current } = server
  if (current === 'deleted') {
    return {
      status: 'skip',
      conflicts: [],
      notes: [
        {
          id:
            change.action === 'delete'
              ? 'osmchange_note_already_deleted'
              : 'osmchange_note_deleted_on_server',
        },
      ],
      result: undefined,
    }
  }
  const sameVersion = ours.version !== undefined && ours.version === current.version
  // the version the file was made from: the server's own when nothing changed since, else what the history gave
  const base = sameVersion ? current : server.base
  const baseNote: Message[] =
    !sameVersion && !base
      ? [
          {
            id: ours.version === undefined ? 'osmchange_note_no_version' : 'osmchange_note_no_base',
            values: { version: ours.version ?? 0 },
          },
        ]
      : []

  if (change.action === 'delete') {
    const changed = !sameVersion
    if (!changed && usedBy.length === 0)
      return { status: 'clean', conflicts: [], notes: [], result: 'delete' }
    const conflict: Conflict = {
      id: `${key}:delete`,
      kind: 'delete',
      changed,
      usedBy,
      default: 'current',
    }
    const choice = choiceOf(conflict, choices)
    return {
      status: 'decide',
      conflicts: [conflict],
      notes: baseNote,
      result: choice === 'file' ? 'delete' : undefined,
    }
  }

  const parts: Part<unknown>[] = []
  const tags = mergeTags(key, base?.tags, ours.tags, current.tags, choices)
  parts.push(tags)
  let geometry: Partial<OsmElement> = {}
  let open = tags.value === undefined
  if (ours.type === 'node') {
    const position = mergePosition(key, base, ours, current, choices)
    parts.push(position)
    if (position.value) geometry = position.value
    else open = true
  } else if (ours.type === 'way') {
    const nodes = mergeNodes(key, base?.nodes, ours.nodes ?? [], current.nodes ?? [], choices)
    parts.push(nodes)
    if (nodes.value) geometry = { nodes: nodes.value }
    else open = true
  } else {
    const members = oneSided(
      base?.members,
      ours.members ?? [],
      current.members ?? [],
      { id: 'osmchange_note_server_members' },
      () =>
        decided(
          { id: `${key}:members`, kind: 'members' },
          ours.members ?? [],
          current.members ?? [],
          choices,
        ),
    )
    parts.push(members)
    if (members.value) geometry = { members: members.value }
    else open = true
  }
  const conflicts = parts.flatMap((part) => part.conflicts)
  const notes = [...baseNote, ...parts.flatMap((part) => part.notes)]
  const result: OsmElement | undefined = open
    ? undefined
    : {
        ...current,
        tags: tags.value ?? current.tags,
        ...geometry,
        ...(current.version !== undefined ? { version: current.version } : {}),
      }
  if (conflicts.length > 0) return { status: 'decide', conflicts, notes, result }
  if (result && sameElement(result, current))
    return {
      status: 'skip',
      conflicts,
      notes: [...notes, { id: 'osmchange_note_already_applied' }],
      result: undefined,
    }
  return { status: sameVersion ? 'clean' : 'auto', conflicts, notes, result }
}

/** Equal in what an upload sends: tags and geometry */
export function sameElement(a: OsmElement, b: OsmElement) {
  return (
    deepEqual(a.tags, b.tags) &&
    (a.type !== 'node' || samePosition(a, b)) &&
    deepEqual(a.nodes ?? [], b.nodes ?? []) &&
    deepEqual(a.members ?? [], b.members ?? [])
  )
}

/** What the file changes on an element: the keys, how far a node moved, whether a way's nodes or a relation's members changed */
export type FileChangeSummary = {
  readonly tags: readonly string[]
  /** Metres a node moved; absent when it did not */
  readonly metres?: number
  readonly nodes: boolean
  readonly members: boolean
}

/**
 * What the file changed on an element it modifies, against the version it was made from (the server's when the history
 * has none): so that the review can say "only moved 2.1 m", which is what most untagged nodes of a file are.
 * Undefined for a new or deleted element, and when the server has no state to compare with.
 */
export function fileChangeOf(
  change: FileChange,
  server: ServerState | undefined,
): FileChangeSummary | undefined {
  if (change.action !== 'modify' || !server) return undefined
  const ours = change.element
  const reference =
    server.base ??
    (server.current !== 'deleted' && server.current.version === ours.version
      ? server.current
      : undefined)
  if (!reference) return undefined
  const tags = [...new Set([...Object.keys(ours.tags), ...Object.keys(reference.tags)])]
    .filter((key) => ours.tags[key] !== reference.tags[key])
    .sort()
  const moved = ours.type === 'node' && !samePosition(ours, reference)
  return {
    tags,
    ...(moved ? { metres: round(metresBetween(reference, ours)) } : {}),
    nodes: ours.type === 'way' && !deepEqual(ours.nodes ?? [], reference.nodes ?? []),
    members: ours.type === 'relation' && !deepEqual(ours.members ?? [], reference.members ?? []),
  }
}
