/**
 * The data of an osmChange file and of its merge, as plain values: no entities, no graph. The file, the server's
 * current state and the base version are all compared in this shape (the OSM API's JSON).
 */

export type ElementType = 'node' | 'way' | 'relation'

export type Tags = Readonly<Record<string, string>>

export type Member = { readonly type: ElementType; readonly ref: number; readonly role: string }

/** One element as the OSM API's JSON has it. A file's new element has a negative id. */
export type OsmElement = {
  readonly type: ElementType
  readonly id: number
  /** Absent for a new element, and in a file that does not give it */
  readonly version?: number
  readonly tags: Tags
  readonly lat?: number
  readonly lon?: number
  readonly nodes?: readonly number[]
  readonly members?: readonly Member[]
}

export type ChangeAction = 'create' | 'modify' | 'delete'

export type FileChange = {
  readonly action: ChangeAction
  readonly element: OsmElement
  /** `<delete if-unused="true">`: the deletion is skipped when the element is still used */
  readonly ifUnused: boolean
  /** When the file's app made or last changed the element (`timestamp`), when it says */
  readonly timestamp?: string
}

export type OsmChangeFile = {
  /** The `generator` attribute (Go Map!!, JOSM, iD, ...) */
  readonly generator?: string
  readonly changes: readonly FileChange[]
}

/**
 * What the server has for an element the file modifies or deletes: its current state (or that it is deleted), and
 * the version the file was made from when that is older and could be read.
 */
export type ServerState = {
  readonly current: OsmElement | 'deleted'
  readonly base?: OsmElement
}

/** A text to show, as a message id with its values: the headless code makes no sentences (ARCHITECTURE.md, Texts) */
export type Message = {
  readonly id: string
  readonly values?: Readonly<Record<string, string | number>>
}

/** The editor's id of an element: `n123`, `w-1` */
export function keyOf(type: ElementType, id: number) {
  return `${type[0]}${id}`
}
