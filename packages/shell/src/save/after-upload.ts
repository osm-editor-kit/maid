import type { UploadResult } from 'osm-api'
import type { ChangeElement, OsmChange } from './osm-change.ts'

/**
 * What an upload gives back, as the editor uses it after the save (save.ts). The server numbers the
 * features that were created, and gives every changed one its new version. Pure: no state.
 */

/**
 * iD and Rapid wait this long after an upload before they load the map again, so that the server's
 * replication has the changes (iD#1646 and iD#2678, Rapid's `SaveMode._resultSuccess`).
 */
export const REPLICATION_DELAY_MS = 2500

const LETTER = { node: 'n', way: 'w', relation: 'r' } as const
const ENTITY_TYPES = ['node', 'way', 'relation'] as const

/** An element as the server answered it: its new id and version */
export type Assigned = { id: string; version: number }

/** One entry of the server's diff result: the id and version an element has now */
type Answer = { newId: number; newVersion: number }

/** The entity id the model gives an element: `n12`, or `w-3` for a way made in this session */
export function entityId(type: ChangeElement['type'], id: number): string {
  return `${LETTER[type]}${id}`
}

/**
 * The server's answer as a map from the id the editor used to the id and version it has now. A
 * deleted element maps to itself, as the server answers it. Every changeset of a chunked upload counts.
 */
export function assignedIds(result: UploadResult): Map<string, Assigned> {
  const assigned = new Map<string, Assigned>()
  for (const changeset of Object.values(result)) {
    for (const type of ENTITY_TYPES) {
      const items = changeset.diffResult[type]
      if (items === undefined) continue
      // the keys are the ids as sent: negative for an element made in this session
      for (const [oldId, { newId, newVersion }] of Object.entries(items) as [string, Answer][]) {
        assigned.set(`${LETTER[type]}${oldId}`, {
          id: `${LETTER[type]}${newId}`,
          version: newVersion,
        })
      }
    }
  }
  return assigned
}

/** The changesets of an upload: one, unless the upload was chunked, in the order the server made them */
export function changesetsOf(result: UploadResult): number[] {
  return Object.keys(result).map(Number)
}

/**
 * The selection after an upload: a feature that was deleted drops out, every other one takes the id
 * the server gave it (a new feature gets its real id). Without duplicates, in the order selected.
 */
export function selectionAfterUpload(
  selection: readonly string[],
  change: OsmChange,
  assigned: ReadonlyMap<string, Assigned>,
): string[] {
  const deleted = new Set(change.delete.map((element) => entityId(element.type, element.id)))
  const next = new Set<string>()
  for (const id of selection) {
    if (deleted.has(id)) continue
    next.add(assigned.get(id)?.id ?? id)
  }
  return [...next]
}
