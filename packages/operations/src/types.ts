import type { Action, Graph } from '@osm-editor-kit/maid-model'

/**
 * A rectangle in lon/lat, in the form the data model's Extent uses: its south-west corner (`min`)
 * and north-east corner (`max`), each as [lon, lat]. An Extent of `maid-model` fits this type.
 */
export type Extent = { min: [number, number]; max: [number, number] }

/** What an operation looks at: the current data and the ids of the selected entities, in the order they were selected */
export type OperationContext = {
  graph: Graph
  selected: readonly string[]
  /**
   * The part of the world the map shows now. Optional: without it, the operations that refuse a
   * feature which is mostly outside the view (`too_large`) never refuse. The app passes the map's bounds.
   */
  viewExtent?: Extent
  /**
   * The same view as its footprint in lon/lat: a convex polygon of its corners, in either winding.
   * Set for a turned map, where the view is not a box; when set, it is the view for `too_large`
   * and `viewExtent` is not read by the rule.
   */
  viewPolygon?: [number, number][]
}

/** What running an operation means: actions that become one undo step */
export type OperationResult = {
  actions: Action[]
  /** Name of the undo step, e.g. "Reversed a line" */
  annotation: string
  /**
   * What is selected afterwards, asked with the graph the actions left behind. A function,
   * because ids of entities that an action creates are only known once it really ran.
   * Absent: the selection stays.
   */
  select?: (after: Graph) => string[]
}

/**
 * Something the editor can do to the selection, as iD's edit menu offers it. An operation is
 * plain data and functions on the graph: no map, no UI. The editor shows `label` and `shortcut`,
 * asks `applies` and `disabled`, and performs what `run` returns.
 */
export type Operation = {
  id: string
  label: string
  /**
   * Its icon in the edit menu and the command bar: a name in iD's sprites (`fas-arrow-right`, `temaki-…`). iD's own
   * operations need none (the shell knows their icons by id); a module's operation without one shows an empty square.
   */
  icon?: string
  /** iD's key for it, a single lower-case letter */
  shortcut?: string
  /** Whether this operation makes sense for this selection at all. False: it is not offered. */
  applies(context: OperationContext): boolean
  /** Why it cannot run now although it applies, as a sentence for a tooltip. Undefined: it can run. */
  disabled(context: OperationContext): string | undefined
  /** Only called when `applies` is true and `disabled` is undefined */
  run(context: OperationContext): OperationResult
}
