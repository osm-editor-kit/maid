import { describe, expect, test } from 'bun:test'
import { sharedIssues } from './shared-issues.ts'
import type { Issue } from './types.ts'

/** An issue of a rule about these features; the fields the rules do not read are left empty */
function issue(rule: string, entityIds: string[], id = `${rule}:${entityIds.join(',')}`): Issue {
  return { id, rule, severity: 'warning', message: rule, entityIds, fixes: [] }
}

describe('sharedIssues', () => {
  test('an issue that involves any selected feature is shown, one that involves none is not', () => {
    const issues = [issue('missing_tag', ['n1']), issue('missing_tag', ['n9'])]
    expect(sharedIssues(issues, ['n1', 'n2']).map((i) => i.entityIds)).toEqual([['n1']])
  })

  test('an issue between a selected and an unselected feature is shown', () => {
    const issues = [issue('crossing_ways', ['w1', 'w9'])]
    expect(sharedIssues(issues, ['w1']).map((i) => i.id)).toEqual(['crossing_ways:w1,w9'])
  })

  test('an issue between two selected features is listed once', () => {
    const issues = [issue('crossing_ways', ['w1', 'w2'])]
    expect(sharedIssues(issues, ['w1', 'w2'])).toHaveLength(1)
  })

  test('the types come in iD order: missing data, identity, geometry, connectivity', () => {
    const issues = [
      issue('impossible_oneway', ['w1']),
      issue('crossing_ways', ['w1']),
      issue('missing_tag', ['w1']),
      issue('disconnected_way', ['w1']),
      issue('mismatched_geometry', ['w1']),
      issue('missing_role', ['w1']),
    ]
    expect(sharedIssues(issues, ['w1']).map((i) => i.rule)).toEqual([
      'missing_tag',
      'missing_role',
      'mismatched_geometry',
      'crossing_ways',
      'disconnected_way',
      'impossible_oneway',
    ])
  })

  test('a rule not in iD order comes after the listed ones, by name', () => {
    const issues = [
      issue('zeta_rule', ['w1']),
      issue('private_data', ['w1']),
      issue('impossible_oneway', ['w1']),
    ]
    expect(sharedIssues(issues, ['w1']).map((i) => i.rule)).toEqual([
      'impossible_oneway',
      'private_data',
      'zeta_rule',
    ])
  })

  test('issues of one rule are ordered by id', () => {
    const issues = [
      issue('missing_tag', ['n2'], 'missing_tag:n2'),
      issue('missing_tag', ['n1'], 'missing_tag:n1'),
    ]
    expect(sharedIssues(issues, ['n1', 'n2']).map((i) => i.id)).toEqual([
      'missing_tag:n1',
      'missing_tag:n2',
    ])
  })

  test('no selection gives no issues, and the input is not reordered', () => {
    const issues = [issue('missing_tag', ['n1']), issue('crossing_ways', ['n1'])]
    expect(sharedIssues(issues, [])).toEqual([])
    expect(issues.map((i) => i.rule)).toEqual(['missing_tag', 'crossing_ways'])
  })
})
