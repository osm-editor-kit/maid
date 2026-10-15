import { describe, expect, it } from 'bun:test'
import { applyOverrides, parseOverrides, subtypeOf } from './overrides.ts'
import type { Issue, Severity } from './types.ts'

// The rule ids and subtypes are the ones the rules in src/rules/ give their issues. The issues are made by hand:
// these tests are about the matching, not about what the rules find.

function issue(
  rule: string,
  data?: Record<string, unknown>,
  severity: Severity = 'warning',
): Issue {
  return {
    id: `${rule}:e1`,
    rule,
    severity,
    message: rule,
    entityIds: ['w1'],
    fixes: [],
    ...(data ? { data } : {}),
  }
}

const crossingHighwayRailway = () =>
  issue('crossing_ways', { featureTypes: ['highway', 'railway'] })
const disconnected = () => issue('disconnected_way')
const missing = () => issue('missing_tag')

/** The issues left when the disable parameter is `rules` */
function withDisable(issues: Issue[], rules: string): Issue[] {
  return applyOverrides(issues, parseOverrides({ disable: rules }))
}

describe('parseOverrides', () => {
  it('has no rules when the parameters are missing or empty', () => {
    const overrides = parseOverrides({})
    expect(overrides.disable).toEqual([])
    expect(overrides.warning).toEqual([])
    expect(overrides.error).toEqual([])
    expect(overrides.unsupported).toEqual([])
    expect(parseOverrides({ disable: '', warning: ' , ', error: undefined }).error).toEqual([])
  })

  it('splits on commas and trims each rule, keeping the rule as written', () => {
    const { disable } = parseOverrides({
      disable: ' crossing_ways/highway* , ,crossing_ways/tunnel*,',
    })
    expect(disable.map((rule) => rule.source)).toEqual([
      'crossing_ways/highway*',
      'crossing_ways/tunnel*',
    ])
  })

  it('reads each parameter into its own list', () => {
    const overrides = parseOverrides({
      disable: 'missing_tag',
      warning: 'disconnected_way',
      error: 'crossing_ways',
      suggestion: 'almost_junction',
    })
    expect(overrides.disable.map((rule) => rule.source)).toEqual(['missing_tag'])
    expect(overrides.warning.map((rule) => rule.source)).toEqual(['disconnected_way'])
    expect(overrides.error.map((rule) => rule.source)).toEqual(['crossing_ways'])
    expect(overrides.unsupported.map((rule) => rule.source)).toEqual(['almost_junction'])
  })

  it('takes the part before the second slash as the subtype, as iD does with a limit of 2', () => {
    const [rule] = parseOverrides({ disable: 'crossing_ways/highway/extra' }).disable
    expect(rule?.subtype.test('highway')).toBe(true)
    expect(rule?.subtype.test('highway/extra')).toBe(false)
  })

  it('skips a rule with an empty type', () => {
    expect(parseOverrides({ disable: '/highway' }).disable).toEqual([])
  })
})

describe('matching rules', () => {
  it('a rule with only a type matches every subtype of it', () => {
    expect(withDisable([crossingHighwayRailway()], 'crossing_ways')).toEqual([])
    expect(
      withDisable(
        [issue('crossing_ways', { featureTypes: ['building', 'highway'] })],
        'crossing_ways',
      ),
    ).toEqual([])
    expect(withDisable([disconnected()], 'crossing_ways')).toHaveLength(1)
  })

  it('a rule with an empty subtype is the same as one without a subtype', () => {
    expect(withDisable([disconnected()], 'disconnected_way/')).toEqual([])
  })

  it('matches the subtype with a wildcard; the subtype is the sorted feature types joined with -', () => {
    expect(withDisable([crossingHighwayRailway()], 'crossing_ways/highway*')).toEqual([])
    expect(withDisable([crossingHighwayRailway()], 'crossing_ways/railway*')).toHaveLength(1)
  })

  it('matches the whole type and subtype, not a part of them', () => {
    // the subtype is highway-railway, so `highway` alone does not match it
    expect(withDisable([crossingHighwayRailway()], 'crossing_ways/highway')).toHaveLength(1)
    expect(withDisable([crossingHighwayRailway()], 'crossing')).toHaveLength(1)
    expect(
      withDisable([issue('crossing_ways', { featureTypes: ['highway'] })], 'crossing_ways/highway'),
    ).toEqual([])
  })

  it('treats the reserved characters of a rule as text', () => {
    expect(withDisable([issue('crossingXways')], 'crossing.ways')).toHaveLength(1)
    expect(withDisable([issue('crossing.ways')], 'crossing.ways')).toEqual([])
  })

  it('a * as the type matches any type', () => {
    expect(withDisable([crossingHighwayRailway()], '*/highway*')).toEqual([])
    expect(withDisable([missing()], '*/highway*')).toHaveLength(1)
  })

  it('matches the subtypes that a rule records in data, such as outdated_tags and relation_members', () => {
    expect(subtypeOf(issue('outdated_tags', { subtype: 'deprecated_tags' }))).toBe(
      'deprecated_tags',
    )
    expect(subtypeOf(issue('relation_members', { subtype: 'duplicate_member' }))).toBe(
      'duplicate_member',
    )
    const issues = [
      issue('outdated_tags', { subtype: 'deprecated_tags' }),
      issue('outdated_tags', { subtype: 'incomplete_tags' }),
    ]
    expect(
      withDisable(issues, 'outdated_tags/deprecated_tags').map((i) => i.data?.subtype),
    ).toEqual(['incomplete_tags'])
  })
})

describe('subtypeOf', () => {
  it('is what iD gives each rule that has one, and the empty string otherwise', () => {
    expect(subtypeOf(crossingHighwayRailway())).toBe('highway-railway')
    expect(subtypeOf(issue('crossing_ways', { featureTypes: ['railway', 'highway'] }))).toBe(
      'highway-railway',
    )
    expect(subtypeOf(issue('impossible_oneway', { type: 'waterway', placement: 'start' }))).toBe(
      'waterway',
    )
    expect(subtypeOf(disconnected())).toBe('highway')
    expect(subtypeOf(issue('almost_junction'))).toBe('highway-highway')
    expect(subtypeOf(issue('osm_api_limits', { nodes: 2001, maxWayNodes: 2000 }))).toBe(
      'exceededMaxWayNodes',
    )
    expect(subtypeOf(issue('osm_api_limits', { members: 9000, maxRelationMembers: 8000 }))).toBe('')
    expect(subtypeOf(missing())).toBe('')
    expect(subtypeOf(issue('crossing_ways'))).toBe('')
  })
})

describe('applyOverrides', () => {
  it('returns every issue when no list is given', () => {
    const issues = [crossingHighwayRailway(), disconnected(), missing()]
    expect(applyOverrides(issues, parseOverrides({}))).toEqual(issues)
  })

  it('drops the issues a disable rule matches', () => {
    const overrides = parseOverrides({ disable: 'disconnected_way,missing_tag' })
    expect(
      applyOverrides([crossingHighwayRailway(), disconnected(), missing()], overrides).map(
        (i) => i.rule,
      ),
    ).toEqual(['crossing_ways'])
  })

  it('shows a matched issue as a warning or an error', () => {
    const overrides = parseOverrides({ warning: 'crossing_ways', error: 'disconnected_way' })
    const result = applyOverrides([crossingHighwayRailway(), disconnected(), missing()], overrides)
    expect(result.map((i) => [i.rule, i.severity])).toEqual([
      ['crossing_ways', 'warning'],
      ['disconnected_way', 'error'],
      ['missing_tag', 'warning'],
    ])
    expect(applyOverrides([issue('missing_tag', undefined, 'error')], overrides)[0]?.severity).toBe(
      'error',
    )
  })

  it('does not change the issues it is given', () => {
    const original = [disconnected()]
    applyOverrides(original, parseOverrides({ error: 'disconnected_way' }))
    expect(original[0]?.severity).toBe('warning')
  })

  it('an error rule wins over a warning rule for the same issue', () => {
    const overrides = parseOverrides({ error: 'crossing_ways', warning: 'crossing_ways' })
    const [result] = applyOverrides([crossingHighwayRailway()], overrides)
    expect(result?.severity).toBe('error')
  })

  it('an error or warning rule keeps an issue that a disable rule also matches, as iD does', () => {
    const issues = [disconnected(), missing()]
    const error = applyOverrides(
      issues,
      parseOverrides({ error: 'disconnected_way', disable: 'disconnected_way' }),
    )
    expect(error.map((i) => [i.rule, i.severity])).toEqual([
      ['disconnected_way', 'error'],
      ['missing_tag', 'warning'],
    ])
    const warning = applyOverrides(
      issues,
      parseOverrides({ warning: 'missing_tag', disable: 'missing_tag' }),
    )
    expect(warning.map((i) => [i.rule, i.severity])).toEqual([
      ['disconnected_way', 'warning'],
      ['missing_tag', 'warning'],
    ])
  })

  it('a suggestion rule changes nothing: no severity change, and it does not stop a disable rule', () => {
    const overrides = parseOverrides({ suggestion: 'disconnected_way', disable: 'missing_tag' })
    expect(
      applyOverrides([disconnected(), missing()], overrides).map((i) => [i.rule, i.severity]),
    ).toEqual([['disconnected_way', 'warning']])
    expect(overrides.unsupported.map((rule) => rule.source)).toEqual(['disconnected_way'])
  })

  it('an issue that matches no rule of any list is kept, with its severity', () => {
    const overrides = parseOverrides({
      disable: 'missing_tag/any',
      error: 'crossing_ways/building*',
    })
    const [result] = applyOverrides([crossingHighwayRailway()], overrides)
    expect(result).toEqual(crossingHighwayRailway())
  })
})
