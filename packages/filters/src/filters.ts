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

/** The three lists of a set, each in list order: the rules, the categories and the fallbacks */
type Parts = {
  readonly rules: readonly Rule[]
  readonly categories: readonly Rule[]
  readonly fallbacks: readonly Rule[]
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

function partition(rules: readonly Rule[]): Parts {
  const ofRules: Rule[] = []
  const categories: Rule[] = []
  const fallbacks: Rule[] = []
  for (const rule of rules) {
    const kind = rule.filter.kind ?? 'rule'
    if (kind === 'rule') ofRules.push(rule)
    else if (kind === 'category') categories.push(rule)
    else fallbacks.push(rule)
  }
  return { rules: ofRules, categories, fallbacks }
}

/** The more permissive of two states: editable, then readonly, then hidden */
const rank: Record<FilterState, number> = { hidden: 0, readonly: 1, editable: 2 }

/**
 * The category that gives the most permissive state among those that match, or undefined when
 * none matches. The first one in list order wins a tie. Stops at the first editable one.
 */
function mostPermissive(categories: readonly Rule[], tags: Tags, geometry: Geometry) {
  let best: Rule | undefined
  for (const rule of categories) {
    if (best !== undefined && best.filter.state === 'editable') break
    if (!ruleMatches(rule.matcher, tags, geometry)) continue
    if (best === undefined || rank[rule.filter.state] > rank[best.filter.state]) best = rule
  }
  return best
}

/**
 * The rule that decides for an object. A rule that matches decides on its own. Otherwise the
 * categories decide, and a fallback only when no category matches. Nothing matching is undefined.
 * No allocation here: it runs for every object on load and on every filter change.
 */
function decide(parts: Parts, tags: Tags, geometry: Geometry) {
  for (const rule of parts.rules) {
    if (ruleMatches(rule.matcher, tags, geometry)) return rule
  }
  return (
    mostPermissive(parts.categories, tags, geometry) ??
    mostPermissive(parts.fallbacks, tags, geometry)
  )
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
  const parts = partition(rules)

  const set: FilterSet = {
    filters: rules.map((rule) => rule.filter),

    states() {
      const out: Record<string, FilterState> = {}
      for (const rule of rules) out[rule.filter.id] = rule.filter.state
      return out
    },

    filterOf(tags, geometry) {
      return decide(parts, tags, geometry)?.filter
    },

    categoriesOf(tags, geometry) {
      const found = parts.categories
        .filter((rule) => ruleMatches(rule.matcher, tags, geometry))
        .map((rule) => rule.filter)
      if (found.length > 0) return found
      return parts.fallbacks
        .filter((rule) => ruleMatches(rule.matcher, tags, geometry))
        .map((rule) => rule.filter)
    },

    stateOf(tags, geometry) {
      return decide(parts, tags, geometry)?.filter.state ?? 'editable'
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
