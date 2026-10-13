import type { Filter, FilterSet, FilterState, Geometry, Tags, TagMatch } from './types'

/** One tag condition: the key must have one of `values`, or any value but `no` when `any` is set */
type Cond = { readonly key: string; readonly any: boolean; readonly values: readonly string[] }

/**
 * A filter compiled once. `geometry` and `keys` are shortcuts that run before `test`: an object
 * of another geometry, or with none of `keys`, cannot match. `keys` is undefined when the
 * filter has no tag condition to look at, so it must always run `test`.
 */
type Matcher = {
  readonly geometry: readonly Geometry[] | undefined
  readonly keys: readonly string[] | undefined
  readonly test: (tags: Tags, geometry: Geometry) => boolean
}

const compiled = new WeakMap<Filter, Matcher>()

function always() {
  return true
}

function compile(filter: Filter) {
  const { geometry, match } = filter
  if (typeof match === 'function') return { geometry, keys: undefined, test: match }
  if (match === '*') return { geometry, keys: undefined, test: always }

  const alternatives: TagMatch[] = Array.isArray(match) ? match : [match]
  const conds: Cond[][] = alternatives.map((alternative) =>
    Object.entries(alternative).map(([key, value]) => ({
      key,
      any: value === '*',
      values: typeof value === 'string' ? [value] : value,
    })),
  )

  const keys = new Set<string>()
  let unconditional = false
  for (const alternative of conds) {
    if (alternative.length === 0) unconditional = true
    for (const cond of alternative) keys.add(cond.key)
  }

  return {
    geometry,
    keys: unconditional ? undefined : [...keys],
    test: (tags) => anyAlternative(conds, tags),
  } satisfies Matcher
}

function matcherOf(filter: Filter) {
  let matcher = compiled.get(filter)
  if (matcher === undefined) {
    matcher = compile(filter)
    compiled.set(filter, matcher)
  }
  return matcher
}

function holds(cond: Cond, tags: Tags) {
  const value = tags[cond.key]
  if (typeof value !== 'string') return false
  if (cond.any) return value !== 'no'
  return cond.values.includes(value)
}

function allHold(conds: readonly Cond[], tags: Tags) {
  for (const cond of conds) if (!holds(cond, tags)) return false
  return true
}

function anyAlternative(alternatives: readonly (readonly Cond[])[], tags: Tags) {
  for (const conds of alternatives) if (allHold(conds, tags)) return true
  return false
}

function anyKeyPresent(tags: Tags, keys: readonly string[]) {
  for (const key of keys) if (typeof tags[key] === 'string') return true
  return false
}

function ruleMatches(matcher: Matcher, tags: Tags, geometry: Geometry) {
  if (matcher.geometry !== undefined && !matcher.geometry.includes(geometry)) return false
  if (matcher.keys !== undefined && !anyKeyPresent(tags, matcher.keys)) return false
  return matcher.test(tags, geometry)
}

/**
 * Whether one filter matches an object. Geometry first, then the tags, or the function.
 * The state is not looked at: that is the set's job.
 */
export function matches(filter: Filter, tags: Tags, geometry: Geometry) {
  return ruleMatches(matcherOf(filter), tags, geometry)
}

function isFilterState(value: string): value is FilterState {
  return value === 'editable' || value === 'readonly' || value === 'hidden'
}

/** A filter in a set, with its current state applied */
type Rule = {
  readonly filter: Filter
  readonly defaultState: FilterState
  readonly matcher: Matcher
}

function makeRules(filters: readonly Filter[], overrides: ReadonlyMap<string, FilterState>) {
  return filters.map((base) => {
    const state = overrides.get(base.id) ?? base.state
    return {
      filter: state === base.state ? base : { ...base, state },
      defaultState: base.state,
      matcher: matcherOf(base),
    }
  })
}

/** The first rule that matches decides; nothing matching is `undefined` */
function decide(rules: readonly Rule[], tags: Tags, geometry: Geometry) {
  for (const rule of rules) {
    if (ruleMatches(rule.matcher, tags, geometry)) return rule
  }
  return undefined
}

/** Reads `id:state,id:state`. Unknown ids and unknown states are ignored. */
function parseParam(ids: ReadonlySet<string>, param: string | null | undefined) {
  const overrides = new Map<string, FilterState>()
  if (!param) return overrides
  for (const part of param.split(',')) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const id = part.slice(0, colon).trim()
    const state = part.slice(colon + 1).trim()
    if (!ids.has(id) || !isFilterState(state)) continue
    overrides.set(id, state)
  }
  return overrides
}

function makeSet(
  filters: readonly Filter[],
  ids: ReadonlySet<string>,
  overrides: ReadonlyMap<string, FilterState>,
) {
  const rules = makeRules(filters, overrides)

  const set: FilterSet = {
    filters: rules.map((rule) => rule.filter),

    states() {
      const out: Record<string, FilterState> = {}
      for (const rule of rules) out[rule.filter.id] = rule.filter.state
      return out
    },

    filterOf(tags, geometry) {
      return decide(rules, tags, geometry)?.filter
    },

    stateOf(tags, geometry) {
      return decide(rules, tags, geometry)?.filter.state ?? 'editable'
    },

    with(id, state) {
      if (!ids.has(id)) return set
      const next = new Map(overrides)
      next.set(id, state)
      return makeSet(filters, ids, next)
    },

    toParam() {
      return rules
        .filter((rule) => rule.filter.state !== rule.defaultState)
        .map((rule) => `${rule.filter.id}:${rule.filter.state}`)
        .join(',')
    },
  }
  return set
}

/**
 * A set of filters with their current states. `param` is the URL form, for example
 * `buildings:readonly,boundaries:hidden`; it lists only the states that differ from the filters'.
 * Throws when two filters have the same id, because the states could not be told apart.
 */
export function createFilterSet(filters: readonly Filter[], param?: string | null): FilterSet {
  const ids = new Set<string>()
  for (const filter of filters) {
    if (ids.has(filter.id)) throw new Error(`Duplicate filter id: ${filter.id}`)
    ids.add(filter.id)
  }
  return makeSet(filters, ids, parseParam(ids, param))
}

/**
 * iD's `disable_features=boundaries,buildings` as this package's parameter:
 * `boundaries:hidden,buildings:hidden`. iD's ids are Maid's default filter ids. iD also accepts
 * `;` as a separator, as it does.
 */
export function fromIdDisableFeatures(value: string) {
  return value
    .split(/[,;]/)
    .map((id) => id.trim())
    .filter((id) => id !== '')
    .map((id) => `${id}:hidden`)
    .join(',')
}
