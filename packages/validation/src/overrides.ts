// iD's URL overrides of validation severity (iD `modules/core/validator.js`, PR 8243): `validationError`,
// `validationWarning`, `validationDisable` and `validationSuggestion`. Each is a comma-separated list of
// `type/subtype` rules; `*` matches any text, and a rule without a subtype matches every subtype.
// Pure: the shell reads the URL and passes the (decoded) values in.

import type { Issue } from './types.ts'

/** One rule as written, e.g. `crossing_ways/highway*`. Type and subtype are compiled as iD does: whole-text matches. */
export type OverrideRule = {
  /** The rule as written, trimmed */
  source: string
  type: RegExp
  subtype: RegExp
}

/** The four parameters as the URL gives them, decoded. Missing or empty means no rules. */
export type OverrideParams = {
  disable?: string | undefined
  warning?: string | undefined
  error?: string | undefined
  suggestion?: string | undefined
}

export type Overrides = {
  /** Issues that match are dropped, unless an error or warning rule matches them too (iD's order) */
  disable: readonly OverrideRule[]
  /** Issues that match are shown as warnings, unless an error rule matches them too */
  warning: readonly OverrideRule[]
  /** Issues that match are shown as errors */
  error: readonly OverrideRule[]
  /**
   * `validationSuggestion`. Maid has no suggestion level, so these rules change nothing: they are parsed and
   * reported here, and `applyOverrides` ignores them.
   */
  unsupported: readonly OverrideRule[]
}

/** iD's `parseHashParam`: split on `,`, trim, `type/subtype`, a missing subtype is `*`, an empty type is skipped */
function parseRules(param: string | undefined): OverrideRule[] {
  const rules: OverrideRule[] = []
  for (const raw of (param ?? '').split(',')) {
    const source = raw.trim()
    // JS split with a limit drops the rest, so `a/b/c` is type `a`, subtype `b`: as in iD
    const parts = source.split('/', 2)
    const type = parts[0] ?? ''
    const subtype = parts[1] || '*'
    if (!type) continue
    rules.push({ source, type: compile(type), subtype: compile(subtype) })
  }
  return rules
}

/** iD's `makeRegExp`: escape the reserved characters, `*` becomes `.*`, anchored at both ends */
function compile(text: string): RegExp {
  const escaped = text.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/** Compiles the four parameters into rules. Does not validate that the rule names exist: iD does not either. */
export function parseOverrides(params: OverrideParams): Overrides {
  return {
    disable: parseRules(params.disable),
    warning: parseRules(params.warning),
    error: parseRules(params.error),
    unsupported: parseRules(params.suggestion),
  }
}

/**
 * The subtype of an issue, as iD's `issue.subtype` (`''` when iD has none). Maid's issues have no subtype field:
 * it is taken from the issue's `data` where a rule records one, or set as iD sets it for that rule.
 * Not covered (no subtype is derived, so only `rule/*` or `rule` matches them): `missing_tag`, `invalid_format`,
 * `mutually_exclusive_tags`, whose iD subtypes Maid does not record.
 */
export function subtypeOf(issue: Issue): string {
  const data = issue.data ?? {}
  // outdated_tags (deprecated_tags, incomplete_tags) and relation_members (duplicate_member, ...) record it
  if (typeof data.subtype === 'string') return data.subtype
  switch (issue.rule) {
    // iD: the two feature types, sorted and joined with `-` (crossing_ways.js), e.g. `highway-railway`
    case 'crossing_ways': {
      const types = data.featureTypes
      return Array.isArray(types) ? types.map(String).sort().join('-') : ''
    }
    // iD: the way type, `highway` or `waterway` (impossible_oneway.js)
    case 'impossible_oneway':
      return typeof data.type === 'string' ? data.type : ''
    // iD sets these subtypes for every issue of the rule (disconnected_way.js, almost_junction.js)
    case 'disconnected_way':
      return 'highway'
    case 'almost_junction':
      return 'highway-highway'
    // iD: only the way-node limit has one (osm_api_limits.js: exceededMaxWayNodes)
    case 'osm_api_limits':
      return data.nodes !== undefined ? 'exceededMaxWayNodes' : ''
    default:
      return ''
  }
}

function matches(rules: readonly OverrideRule[], type: string, subtype: string): boolean {
  return rules.some((rule) => rule.type.test(type) && rule.subtype.test(subtype))
}

/**
 * Applies the overrides to issues, as iD's `applySeverityOverrides`: the first list that matches decides, in the order
 * error, warning, disable. So an error rule keeps an issue (as an error) even when a disable rule matches it too.
 * Returns new issues where the severity changed; the input is not changed.
 */
export function applyOverrides(issues: readonly Issue[], overrides: Overrides): Issue[] {
  const result: Issue[] = []
  for (const issue of issues) {
    const subtype = subtypeOf(issue)
    if (matches(overrides.error, issue.rule, subtype)) {
      result.push(issue.severity === 'error' ? issue : { ...issue, severity: 'error' })
    } else if (matches(overrides.warning, issue.rule, subtype)) {
      result.push(issue.severity === 'warning' ? issue : { ...issue, severity: 'warning' })
    } else if (!matches(overrides.disable, issue.rule, subtype)) {
      result.push(issue)
    }
  }
  return result
}
