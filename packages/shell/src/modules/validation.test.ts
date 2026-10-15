import { describe, expect, it } from 'bun:test'
import { applyOverrides, parseOverrides, type Issue } from '@osm-editor-kit/maid-validation'
import { overridesFromSearch } from './validation.tsx'

/** An issue of one rule with the given data, the fields the overrides read */
function issue(rule: string, severity: 'error' | 'warning', data?: Record<string, unknown>): Issue {
  return {
    id: `${rule}:n1`,
    rule,
    severity,
    message: rule,
    entityIds: ['n1'],
    fixes: [],
    data,
  } as unknown as Issue
}

describe('overridesFromSearch', () => {
  it('reads the three iD parameters from the address', () => {
    const overrides = overridesFromSearch(
      '?validation_disable=crossing_ways&validation_warning=missing_tag/*&validation_error=outdated_tags/deprecated_tags',
    )
    expect(overrides.disable.map((rule) => rule.source)).toEqual(['crossing_ways'])
    expect(overrides.warning.map((rule) => rule.source)).toEqual(['missing_tag/*'])
    expect(overrides.error.map((rule) => rule.source)).toEqual(['outdated_tags/deprecated_tags'])
    expect(overrides.unsupported).toEqual([])
  })

  it('gives no rules when the address names none, or names them empty', () => {
    for (const search of [
      '',
      '?map=18/0/0',
      '?validation_disable=',
      '?validation_disable=%20,%20',
    ]) {
      const overrides = overridesFromSearch(search)
      expect(overrides.disable).toEqual([])
      expect(overrides.warning).toEqual([])
      expect(overrides.error).toEqual([])
    }
  })

  it('decodes the values and splits them on commas, as iD does', () => {
    const overrides = overridesFromSearch(
      '?validation_disable=crossing_ways%2Fhighway*,%20almost_junction',
    )
    expect(overrides.disable.map((rule) => rule.source)).toEqual([
      'crossing_ways/highway*',
      'almost_junction',
    ])
  })

  it('keeps validationSuggestion apart, as unsupported, since Maid has no suggestion level', () => {
    const overrides = overridesFromSearch('?validation_disable=crossing_ways&validation_error=x')
    expect(overrides.unsupported).toEqual([])
    const suggestion = parseOverrides({ suggestion: 'missing_tag' })
    expect(suggestion.unsupported.map((rule) => rule.source)).toEqual(['missing_tag'])
  })

  it('switches a rule off, or changes its level, through applyOverrides', () => {
    const issues = [
      issue('crossing_ways', 'error', { featureTypes: ['highway', 'railway'] }),
      issue('missing_tag', 'warning'),
      issue('outdated_tags', 'warning', { subtype: 'deprecated_tags' }),
    ]
    const disabled = applyOverrides(
      issues,
      overridesFromSearch('?validation_disable=crossing_ways,outdated_tags/deprecated_tags'),
    )
    expect(disabled.map((item) => item.rule)).toEqual(['missing_tag'])

    const changed = applyOverrides(
      issues,
      overridesFromSearch('?validation_warning=crossing_ways&validation_error=missing_tag'),
    )
    expect(changed.map((item) => item.severity)).toEqual(['warning', 'error', 'warning'])
  })
})
