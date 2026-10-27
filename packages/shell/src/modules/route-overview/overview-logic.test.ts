import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import {
  analyzeRoute,
  layoutOverview,
  type OverviewRow,
  type RouteInput,
  type RouteIssue,
} from '@osm-editor-kit/maid-route-analysis'
import {
  formatKm,
  groupOf,
  idsOf,
  includesHovered,
  ISSUE_CODES,
  issueMessageKeys,
  issueParams,
  rowLabel,
  rowRole,
  sectionHovered,
  selectableId,
  splitRows,
} from './overview-logic.ts'

const input: RouteInput = {
  tags: { type: 'route', route: 'bus' },
  members: [
    { type: 'way', id: 'w1', role: '' },
    { type: 'node', id: 'n9', role: 'stop' },
    { type: 'way', id: 'w2', role: '' },
    { type: 'way', id: 'w404', role: '' },
    { type: 'relation', id: 'r5', role: '' },
  ],
  ways: new Map([
    ['w1', ['n1', 'n2']],
    ['w2', ['n3', 'n4']],
  ]),
  nodes: new Map([
    ['n1', [0, 0]],
    ['n2', [0.001, 0]],
    ['n3', [0.0012, 0]],
    ['n4', [0.002, 0]],
    ['n9', [0.0005, 0]],
  ]),
  memberTags: new Map([['n9', { name: 'Central', public_transport: 'stop_position' }]]),
}
const analysis = analyzeRoute(input)
const layout = layoutOverview(analysis, 'schematic')
const rowOf = (kind: OverviewRow['kind']) => layout.rows.find((row) => row.kind === kind)

describe('texts', () => {
  it('has a title, a text and a todo in every language for every issue code', async () => {
    for (const language of ['en', 'de', 'fr', 'es']) {
      const file = (await Bun.file(
        join(import.meta.dir, `../../../../i18n/messages/${language}.json`),
      ).json()) as Record<string, string>
      for (const code of ISSUE_CODES) {
        const keys = issueMessageKeys(code)
        for (const key of [keys.title, keys.text, keys.todo])
          expect(file[key], `${language} ${key}`).toBeTruthy()
      }
    }
  })
  it('lists every issue code of the analysis contract', async () => {
    const source = await Bun.file(
      join(import.meta.dir, '../../../../route-analysis/src/types.ts'),
    ).text()
    const block = source.slice(
      source.indexOf('export type IssueCode'),
      source.indexOf('export type RouteIssue'),
    )
    const codes = [...block.matchAll(/\| '([a-z-]+)'/g)].map((match) => match[1])
    expect([...codes].sort((a, b) => (a ?? '').localeCompare(b ?? ''))).toEqual(
      [...ISSUE_CODES].sort((a, b) => a.localeCompare(b)),
    )
  })
  it('names the message after the code', () => {
    expect(issueMessageKeys('not-loaded').title).toBe('route_overview_issue_not_loaded_title')
  })
})

describe('issueParams', () => {
  it('reads the detail numbers and falls back to the members', () => {
    const base: RouteIssue = { code: 'gap', severity: 'warning', members: [3, 4] }
    expect(issueParams({ ...base, detail: { distance: 120 } }).distance).toBe(120)
    expect(issueParams({ ...base }).count).toBe(2)
    expect(issueParams({ ...base, detail: { role: 'x' } }).role).toBe('x')
  })
})

describe('formatKm', () => {
  it('has one decimal and the number format of the locale', () => {
    expect(formatKm(1234, 'en')).toBe('1.2')
    expect(formatKm(1234, 'de')).toBe('1,2')
    expect(formatKm(0, 'en')).toBe('0.0')
    expect(formatKm(12_345, 'en')).toBe('12.3')
  })
})

describe('groups and hover', () => {
  it('reads the group of an unplaced row', () => {
    expect(groupOf({ key: 'unplaced:points', kind: 'unplaced' })).toBe('points')
    expect(groupOf({ key: 'unplaced:issues', kind: 'unplaced' })).toBeUndefined()
    expect(groupOf({ key: 'start', kind: 'start' })).toBeUndefined()
  })
  it('matches a hovered id against the ids of a row', () => {
    expect(includesHovered(['w1', 'n2'], 'n2')).toBe(true)
    expect(includesHovered(['w1'], null)).toBe(false)
    expect(includesHovered([], 'w1')).toBe(false)
  })
  it('maps member indexes to ids', () => {
    expect(idsOf(analysis, [0, 2, 99])).toEqual(['w1', 'w2'])
  })
  it('knows the section of a hovered way', () => {
    const hovered = layout.sections.filter((section) => sectionHovered(analysis, section, 'w1'))
    expect(hovered.length).toBeGreaterThan(0)
    expect(layout.sections.some((section) => sectionHovered(analysis, section, 'w404'))).toBe(false)
  })
})

describe('rows', () => {
  it('names a stop by its tags and the start plainly', () => {
    const stop = rowOf('stop')
    expect(stop && rowLabel(analysis, stop, input.memberTags)).toEqual({ name: 'Central' })
    const start = rowOf('start')
    expect(start && rowLabel(analysis, start, input.memberTags)).toEqual({ text: 'start' })
  })
  it('falls back to a readable label', () => {
    const stop = rowOf('stop')
    expect(stop && rowLabel(analysis, stop, undefined)).toEqual({ text: 'stop' })
  })
  it('counts the members of an unplaced group', () => {
    const group = layout.rows.find((row) => row.key === 'unplaced:unloaded')
    expect(group && rowLabel(analysis, group, undefined)).toEqual({ group: 'unloaded', count: 1 })
    const sub = layout.rows.find((row) => row.key === 'unplaced:subroute')
    expect(sub && rowLabel(analysis, sub, undefined)).toEqual({ group: 'subroute', count: 1 })
  })
  it('selects only a row of exactly one member', () => {
    const stop = rowOf('stop')
    expect(stop && selectableId(analysis, stop)).toBe('n9')
    const group = layout.rows.find((row) => row.kind === 'unplaced')
    expect(group && selectableId(analysis, group)).toBeUndefined()
    const gap = { ...(rowOf('start') as OverviewRow), kind: 'gap' as const }
    expect(selectableId(analysis, gap)).toBeUndefined()
  })
  it('gives the role of a stop', () => {
    const stop = rowOf('stop')
    expect(stop && rowRole(analysis, stop)).toBe('stop')
  })
  it('keeps the unplaced groups out of the limit', () => {
    const { placed, shown, unplaced } = splitRows(layout.rows, 2)
    expect(shown.length).toBe(2)
    expect(placed.length + unplaced.length).toBe(layout.rows.length)
    expect(unplaced.length).toBeGreaterThan(0)
  })
})
