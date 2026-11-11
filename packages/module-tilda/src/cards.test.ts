import { describe, expect, test } from 'bun:test'
import { radnetzBerlin } from '@tilda-geo/bicycle-infrastructure-tagging/profiles/radnetz-berlin'
import {
  attributeUpdate,
  bothSidesKey,
  bothSidesUpdate,
  buildCards,
  gapAnswerCategory,
  gapUpdate,
  mergeSides,
  onewayChoices,
  openChoices,
  openCount,
  toTagChange,
  type TildaCheck,
} from './cards.ts'

const none = () => undefined
const options = { profile: radnetzBerlin, choices: new Map(), edited: new Set<string>() }

describe('bothSidesKey', () => {
  test('left and right become both', () => {
    expect(bothSidesKey('cycleway:left:surface', 'cycleway:right:surface')).toBe(
      'cycleway:both:surface',
    )
  })
  test('other differences stay apart', () => {
    expect(bothSidesKey('cycleway:left:surface', 'sidewalk:right:surface')).toBeUndefined()
    expect(bothSidesKey('cycleway:right:width', 'cycleway:left:width')).toBeUndefined()
  })
})

describe('bothSidesUpdate', () => {
  test('the same value goes on the :both key and removes the side keys', () => {
    expect(
      bothSidesUpdate({ 'cycleway:left:width': '2' }, { 'cycleway:right:width': '2' }),
    ).toEqual({
      'cycleway:left:width': undefined,
      'cycleway:right:width': undefined,
      'cycleway:both:width': '2',
    })
  })
  test('different values stay on their sides', () => {
    expect(
      bothSidesUpdate({ 'cycleway:left:width': '2' }, { 'cycleway:right:width': '3' }),
    ).toEqual({ 'cycleway:left:width': '2', 'cycleway:right:width': '3' })
  })
})

describe('buildCards', () => {
  test('a road with lanes on both sides has a card per side and a folded card for itself', () => {
    const tags = {
      highway: 'secondary',
      'cycleway:both': 'lane',
      'cycleway:both:lane': 'exclusive',
    }
    const cards = buildCards(tags, options)
    expect(cards.map((card) => card.side)).toEqual(['self', 'left', 'right'])
    expect(cards[0]?.collapsible).toBe(true)
    expect(cards[1]?.result.category).toBe('cyclewayOnHighway_exclusive')
    // same on both sides: one card
    const merged = mergeSides(cards, none, (card) => card.result.category, new Set())
    expect(merged.map((card) => card.side)).toEqual(['self', 'left'])
    expect(merged[1]?.twin?.side).toBe('right')
  })

  test('a lane of unknown kind asks the open question; the answer names the category', () => {
    const tags = { highway: 'secondary', 'cycleway:right': 'lane', 'cycleway:left': 'no' }
    const right = buildCards(tags, options).find((card) => card.side === 'right')
    expect(right?.result.category).toBe('cyclewayOnHighway_advisoryOrExclusive')
    const gap = right?.gaps[0]
    expect(gap).toBeDefined()
    if (!gap || !right) return
    expect(gap.values).toContain('exclusive')
    expect(gapAnswerCategory(tags, gap, right, 'exclusive')).toBe('cyclewayOnHighway_exclusive')
    expect(gapUpdate(gap, right, 'exclusive')).toEqual({ 'cycleway:right:lane': 'exclusive' })
    expect(openCount(right, none)).toBeGreaterThan(0)
  })

  test('a footway still gets a card for itself, to choose what it should become', () => {
    const cards = buildCards({ highway: 'footway' }, options)
    expect(cards[0]?.side).toBe('self')
  })

  test('"Change to" plans the tags; a reached choice is dropped', () => {
    const tags = { highway: 'path', traffic_sign: 'none' }
    const choice = {
      kind: 'footAndCyclewayShared',
      position: 'isolated',
      sign: 'unsigned',
    } as const
    const choices = new Map([['self' as const, choice]])
    const self = buildCards(tags, { ...options, choices })[0]
    expect(self?.plan?.add.map((entry) => entry.key)).toContain('segregated')
    expect(self?.target).toBe('footAndCyclewayShared_isolated')
    const after = {
      ...tags,
      segregated: 'no',
      bicycle: 'designated',
      foot: 'designated',
      is_sidepath: 'no',
    }
    expect(openChoices(after, choices).size).toBe(0)
    expect(openChoices(tags, choices).size).toBe(1)
  })

  test('a confirmed default counts as done', () => {
    const tags = { highway: 'cycleway', bicycle: 'designated', is_sidepath: 'no' }
    const self = buildCards(tags, options)[0]
    const assumed = self?.attributes.find((attribute) => attribute.state === 'assumed')
    expect(assumed).toBeDefined()
    if (!self || !assumed?.default) return
    const check: TildaCheck = { answer: assumed.default, wayVersion: '1', at: '2026-11-10' }
    const checked = (id: string) => (id === assumed.key ? check : undefined)
    expect(openCount(self, checked)).toBe(openCount(self, none) - 1)
  })
})

test('attributeUpdate moves oneway to oneway:bicycle when the value is the same', () => {
  const attribute = {
    id: 'oneway_bicycle',
    ruleSet: 'common',
    key: 'oneway:bicycle',
    value: undefined,
    tagged: [{ key: 'oneway', value: 'yes' }],
    lookup: ['oneway:bicycle', 'oneway'],
    tilda: 'yes',
    state: 'ok',
    options: [],
    optional: false,
    feeds: [],
  } as const
  expect(
    attributeUpdate(
      { oneway: 'yes' },
      {
        ...attribute,
        tagged: [...attribute.tagged],
        lookup: [...attribute.lookup],
        options: [],
        feeds: [],
      },
      'yes',
    ),
  ).toEqual({
    'oneway:bicycle': 'yes',
    oneway: undefined,
  })
})

test('toTagChange splits sets and removals', () => {
  expect(toTagChange({ a: '1', b: undefined })).toEqual({ set: { a: '1' }, remove: ['b'] })
})

describe('onewayChoices', () => {
  const attributes = (tags: Record<string, string>, side: string) =>
    buildCards(tags, options).find((card) => card.side === side)?.attributes ?? []
  const oneway = (tags: Record<string, string>, side: string) =>
    attributes(tags, side).find((attribute) => attribute.id === 'oneway')

  test('a way of its own: yes and no, never -1', () => {
    const attribute = oneway({ highway: 'cycleway', is_sidepath: 'no' }, 'self')
    expect(attribute).toBeDefined()
    if (!attribute) return
    expect(onewayChoices(attribute, 'self')?.map((choice) => choice.value)).toEqual(['yes', 'no'])
  })

  test('the left side of a two-way road: both ways, or a left lane ridden with the line', () => {
    const tags = {
      highway: 'secondary',
      'cycleway:both': 'lane',
      'cycleway:both:lane': 'exclusive',
    }
    const left = oneway(tags, 'left')
    const right = oneway(tags, 'right')
    if (!left || !right) throw new Error('no oneway row')
    expect(onewayChoices(left, 'left')).toEqual([
      { value: 'no', meaning: 'both' },
      { value: 'yes', meaning: 'left_with_line' },
    ])
    expect(onewayChoices(right, 'right')).toEqual([{ value: 'no', meaning: 'both' }])
  })

  test('the left side of a one-way road runs with the line: only both ways', () => {
    const tags = {
      highway: 'secondary',
      oneway: 'yes',
      'cycleway:both': 'lane',
      'cycleway:both:lane': 'exclusive',
    }
    const left = oneway(tags, 'left')
    if (!left) throw new Error('no oneway row')
    expect(onewayChoices(left, 'left')).toEqual([{ value: 'no', meaning: 'both' }])
  })
})
