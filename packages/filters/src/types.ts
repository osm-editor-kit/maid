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

/** A named rule and the state its objects start in */
export type Filter = {
  id: string
  /** Shown in the filter panel */
  label: string
  match: FilterMatch
  /** Only objects of these geometries. Absent: all. */
  geometry?: Geometry[]
  state: FilterState
}

/**
 * An ordered list of filters with their current states. The first filter that matches an object
 * decides; an object that no filter matches is editable. A set never changes: `with` returns a
 * new one.
 */
export type FilterSet = {
  readonly filters: readonly Filter[]
  /** The current state of every filter, by id */
  states(): Record<string, FilterState>
  /** The filter that decides for this object, if any */
  filterOf(tags: Tags, geometry: Geometry): Filter | undefined
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
