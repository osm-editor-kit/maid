export type Tags = Record<string, string>
export type Geometry = 'point' | 'vertex' | 'line' | 'area' | 'relation'

/** What can be done with the objects of a filter: edit them, only look at them, or not have them on the map */
export type FilterState = 'editable' | 'readonly' | 'hidden'

/**
 * Tag conditions that must all hold. A value is one tag value, a list of values (any of them),
 * or `'*'` for "the key is there with any value except `no`".
 */
export type TagMatch = Record<string, string | string[]>

/**
 * Which objects a filter is for: `'*'` for everything, tag conditions (a list means any of
 * them), or a function where data cannot say it. Data can be shown, stored and compared; a
 * function cannot, so use one only where it is needed.
 */
export type FilterMatch =
  | '*'
  | TagMatch
  | TagMatch[]
  | ((tags: Tags, geometry: Geometry) => boolean)

/**
 * How a filter takes part in the decision:
 * - `rule` (the default): one of an editor's own rules, for example a fork's `cycleways`. The first
 *   rule that matches decides, before any category does, wherever the rule sits in the list.
 * - `category`: one of iD's categories. An object can be in several; its state is the most
 *   permissive state of them (editable beats read-only, read-only beats hidden).
 * - `fallback`: a category that takes only what no other category takes (iD's `others`).
 */
export type FilterKind = 'rule' | 'category' | 'fallback'

/** A named rule and the state its objects start in */
export type Filter = {
  id: string
  /** Shown in the filter panel */
  label: string
  match: FilterMatch
  /** Only objects of these geometries. Absent: all. */
  geometry?: Geometry[]
  state: FilterState
  /** Absent: `rule`. See FilterKind. */
  kind?: FilterKind
}

/**
 * An ordered list of filters with their current states. An object gets its state in two steps:
 * the first `rule` that matches decides; otherwise the categories it belongs to decide, and the
 * most permissive of their states is the object's. An object that nothing matches is editable.
 * A set never changes: `with` returns a new one.
 */
export type FilterSet = {
  readonly filters: readonly Filter[]
  /** The current state of every filter, by id */
  states(): Record<string, FilterState>
  /**
   * The filter that decides for this object, if any. For a rule, that rule. For categories, the
   * first category of the object that has the state the object gets.
   */
  filterOf(tags: Tags, geometry: Geometry): Filter | undefined
  /**
   * The categories the object belongs to, in list order, whatever their states. A fallback is
   * listed only when no other category is.
   */
  categoriesOf(tags: Tags, geometry: Geometry): Filter[]
  /** What can be done with this object */
  stateOf(tags: Tags, geometry: Geometry): FilterState
  /** A set with the state of one filter changed. An unknown id returns the same set. */
  with(id: string, state: FilterState): FilterSet
  /**
   * The states that differ from the filters' own, for the URL: `buildings:readonly,boundaries:hidden`.
   * Empty when nothing differs.
   */
  toParam(): string
}
