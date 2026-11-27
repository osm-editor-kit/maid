import { describe, expect, it } from 'bun:test'
import {
  applySideBatch,
  shownAfterPlain,
  splitBothSteps,
  applySteps,
  combineTags,
  sideSteps,
  stepsOfChange,
  tagDiff,
  compareSideKeys,
  copySideRow,
  mergeSides,
  presetKeysFor,
  sameTags,
  sideLayout,
  sidePlaceOf,
  sideRowId,
  sideSheetRows,
  allowedWhenOff,
  splitBoth,
} from './tag-sides.ts'

describe('sidePlaceOf: which keys belong to a side group', () => {
  it('the group as the first part, or the second after a meta prefix', () => {
    expect(sidePlaceOf('cycleway')?.group).toBe('cycleway')
    expect(sidePlaceOf('cycleway:both:width')?.group).toBe('cycleway')
    expect(sidePlaceOf('sidewalk:left')?.group).toBe('sidewalk')
    expect(sidePlaceOf('parking:both:orientation')?.group).toBe('parking')
    expect(sidePlaceOf('source:cycleway:both:width')).toEqual({
      group: 'cycleway',
      meta: 'source',
      path: 'cycleway:both:width',
    })
    expect(sidePlaceOf('fixme:sidewalk')?.group).toBe('sidewalk')
    expect(sidePlaceOf('mapillary:cycleway:right')?.group).toBe('cycleway')
  })

  it('other keys are in none', () => {
    expect(sidePlaceOf('highway')).toBeUndefined()
    expect(sidePlaceOf('name:etymology:wikidata')).toBeUndefined()
    expect(sidePlaceOf('cycleway_lane')).toBeUndefined()
    expect(sidePlaceOf('a:b:cycleway')).toBeUndefined()
  })
})

describe('compareSideKeys: the order of the sides view', () => {
  it('keys in no group first, then sidewalk, cycleway, parking; meta keys right under their key', () => {
    const keys = [
      'source:cycleway:both:width',
      'surface',
      'cycleway:both:width',
      'foot',
      'cycleway:both',
      'fixme:cycleway',
      'cycleway',
      'bicycle',
      'sidewalk:both',
      'name',
      'parking:both',
      'postal_code',
    ]
    expect([...keys].sort(compareSideKeys)).toEqual([
      'bicycle',
      'foot',
      'name',
      'postal_code',
      'surface',
      'sidewalk:both',
      'cycleway',
      'fixme:cycleway',
      'cycleway:both',
      'cycleway:both:width',
      'source:cycleway:both:width',
      'parking:both',
    ])
  })
})

describe('splitBoth: :both shown as its two sides', () => {
  it('every both key of a group, meta prefixed ones too; others stay', () => {
    expect(
      splitBoth({
        highway: 'residential',
        'cycleway:both': 'lane',
        'cycleway:both:surface': 'asphalt',
        'source:cycleway:both:width': 'Luftbild 2025',
        'parking:both': 'no',
        'name:both': 'x',
      }),
    ).toEqual({
      highway: 'residential',
      'cycleway:left': 'lane',
      'cycleway:right': 'lane',
      'cycleway:left:surface': 'asphalt',
      'cycleway:right:surface': 'asphalt',
      'source:cycleway:left:width': 'Luftbild 2025',
      'source:cycleway:right:width': 'Luftbild 2025',
      'parking:left': 'no',
      'parking:right': 'no',
      'name:both': 'x',
    })
  })

  it('a both key whose side says something else stays as it is', () => {
    const tags = { 'cycleway:both:width': '1.5', 'cycleway:left:width': '2' }
    expect(splitBoth(tags)).toEqual(tags)
    expect(splitBoth({ 'cycleway:both': 'lane', 'cycleway:left': 'lane' })).toEqual({
      'cycleway:left': 'lane',
      'cycleway:right': 'lane',
    })
  })
})

describe('mergeSides: what is stored after a change in the sides view', () => {
  const stored = { highway: 'residential', 'cycleway:both': 'lane', 'cycleway:both:width': '1.5' }
  const shown = splitBoth(stored)

  it('unchanged sides that were both are both again', () => {
    expect(mergeSides({ ...shown, lit: 'yes' }, shown, stored)).toEqual({ ...stored, lit: 'yes' })
  })

  it('a side changed: the two are stored apart, the both key goes', () => {
    expect(mergeSides({ ...shown, 'cycleway:left:width': '2' }, shown, stored)).toEqual({
      highway: 'residential',
      'cycleway:both': 'lane',
      'cycleway:left:width': '2',
      'cycleway:right:width': '1.5',
    })
  })

  it('a side set to the value of the other: both', () => {
    const apart = { 'sidewalk:left': 'separate', 'sidewalk:right': 'no' }
    expect(mergeSides({ ...apart, 'sidewalk:right': 'separate' }, apart, apart)).toEqual({
      'sidewalk:both': 'separate',
    })
  })

  it('equal sides stored apart and not touched stay apart', () => {
    const apart = { 'sidewalk:left': 'separate', 'sidewalk:right': 'separate' }
    expect(mergeSides({ ...apart, lit: 'yes' }, apart, apart)).toEqual({ ...apart, lit: 'yes' })
  })

  it('meta keys merge the same way', () => {
    const metaStored = { 'source:cycleway:both:width': 'Luftbild 2025' }
    const metaShown = splitBoth(metaStored)
    expect(mergeSides(metaShown, metaShown, metaStored)).toEqual(metaStored)
  })
})

describe('sameTags', () => {
  it('compares keys and values', () => {
    expect(sameTags({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
    expect(sameTags({ a: '1' }, { a: '1', b: '2' })).toBe(false)
  })
})

describe('sideLayout: the tags with no side on top, the sided ones as rows of three columns', () => {
  const shown = splitBoth({
    highway: 'residential',
    cycleway: 'lane',
    'fixme:sidewalk': 'check',
    'cycleway:both:width': '1.5',
    'source:cycleway:both:width': 'Luftbild 2025',
    'cycleway:left:oneway': '-1',
    'cycleway:right:oneway': 'yes',
    'sidewalk:right': 'separate',
    'parking:both': 'no',
  })
  const layout = sideLayout(shown)

  it('keys without a side, the plain group keys among them, stay in the table on top', () => {
    expect(layout.plain).toEqual({
      highway: 'residential',
      cycleway: 'lane',
      'fixme:sidewalk': 'check',
    })
  })

  it('a row per pattern, the groups as sidewalk, cycleway, parking, a missing side left empty', () => {
    expect(layout.groups).toEqual([
      { group: 'sidewalk', rows: [{ pattern: 'sidewalk:{side}', right: 'separate' }] },
      {
        group: 'cycleway',
        rows: [
          { pattern: 'cycleway:{side}:oneway', left: '-1', right: 'yes' },
          { pattern: 'cycleway:{side}:width', left: '1.5', right: '1.5' },
          {
            pattern: 'source:cycleway:{side}:width',
            left: 'Luftbild 2025',
            right: 'Luftbild 2025',
          },
        ],
      },
      { group: 'parking', rows: [{ pattern: 'parking:{side}', left: 'no', right: 'no' }] },
    ])
  })
})

describe('applySideBatch: a change in a group table', () => {
  const shown = { 'cycleway:left:width': '1.5', 'cycleway:right:width': '1.5', lit: 'yes' }
  const rows = sideLayout(shown).groups[0]?.rows ?? []
  const id = sideRowId('cycleway:{side}:width')

  it('a value sets or clears its side only', () => {
    expect(
      applySideBatch(shown, rows, {
        cause: 'edit',
        changes: [{ type: 'set', row: id, col: 'value', text: ' 2 ' }],
      }).tags,
    ).toEqual({ ...shown, 'cycleway:left:width': '2' })
    expect(
      applySideBatch(shown, rows, {
        cause: 'delete',
        changes: [{ type: 'clear', row: id, col: 'right' }],
      }).tags,
    ).toEqual({ 'cycleway:left:width': '1.5', lit: 'yes' })
  })

  it('a new key text renames both sides; without {side} in its place it is refused', () => {
    expect(
      applySideBatch(shown, rows, {
        cause: 'edit',
        changes: [{ type: 'set', row: id, col: 'key', text: 'cycleway:{side}:buffer' }],
      }).tags,
    ).toEqual({ 'cycleway:left:buffer': '1.5', 'cycleway:right:buffer': '1.5', lit: 'yes' })
    const refused = applySideBatch(shown, rows, {
      cause: 'edit',
      changes: [{ type: 'set', row: id, col: 'key', text: 'cycleway:width' }],
    })
    expect(refused.tags).toEqual(shown)
    expect(refused.refused).toHaveLength(1)
  })

  it('clearing the key or removing the row removes both sides', () => {
    expect(
      applySideBatch(shown, rows, { cause: 'delete', changes: [{ type: 'remove', row: id }] }).tags,
    ).toEqual({ lit: 'yes' })
  })
})

describe('copySideRow: a copy of a group row is key=value lines', () => {
  it('the left (value column) and the right key of the row', () => {
    const [row] = sideSheetRows(
      [{ pattern: 'cycleway:{side}:width', left: '1.5', right: '2' }],
      'cycleway',
    )
    if (row === undefined) throw new Error('expected a row')
    expect(copySideRow(row, ['key', 'value', 'right'])).toEqual([
      'cycleway:left:width=1.5',
      'cycleway:right:width=2',
    ])
    expect(copySideRow(row, ['right'])).toEqual(['cycleway:right:width=2'])
  })
})

describe('presetKeysFor: where the presets values of a key come from', () => {
  it('the key, then without its side, then the part after the side', () => {
    expect(presetKeysFor('cycleway:left:surface')).toEqual([
      'cycleway:left:surface',
      'cycleway:surface',
      'surface',
    ])
    expect(presetKeysFor('cycleway:right')).toEqual(['cycleway:right', 'cycleway'])
    expect(presetKeysFor('cycleway:lane')).toEqual(['cycleway:lane', 'lane'])
  })
  it('a meta key and a key in no group only as themselves', () => {
    expect(presetKeysFor('source:cycleway:left:width')).toEqual(['source:cycleway:left:width'])
    expect(presetKeysFor('highway')).toEqual(['highway'])
  })
})

describe('several features: steps, combined values and what each feature gets', () => {
  it('combineTags: one value when all agree, else the values by count and whether one lacks the key', () => {
    expect(combineTags([{ a: 'x', b: 'y' }, { a: 'x' }])).toEqual({
      a: { kind: 'one', value: 'x' },
      b: { kind: 'mixed', values: ['y'], missing: true },
    })
  })

  it('a rename moves each feature its own value, and leaves a feature without the key alone', () => {
    const rows = [{ pattern: 'cycleway:{side}:width' }]
    const { steps } = sideSteps(
      rows,
      {
        cause: 'edit',
        changes: [
          {
            type: 'set',
            row: 'side:cycleway:{side}:width',
            col: 'key',
            text: 'cycleway:{side}:buffer',
          },
        ],
      },
      () => false,
    )
    expect(applySteps({ 'cycleway:left:width': '1', 'cycleway:right:width': '2' }, steps)).toEqual({
      'cycleway:left:buffer': '1',
      'cycleway:right:buffer': '2',
    })
    expect(applySteps({ lit: 'yes' }, steps)).toEqual({ lit: 'yes' })
  })

  it('stepsOfChange: renames, then removes, then sets; tagDiff: what to set and what to remove', () => {
    expect(
      applySteps(
        { a: '1', b: '2' },
        stepsOfChange({ rename: [{ from: 'a', to: 'c' }], remove: ['b'], set: { d: '4' } }),
      ),
    ).toEqual({ c: '1', d: '4' })
    expect(tagDiff({ a: '1', b: '2' }, { a: '1', c: '3' })).toEqual({
      set: { c: '3' },
      remove: ['b'],
    })
  })
})

describe('a side that is off (no, none, separate): its other cells are locked, a value left there is an error', () => {
  const rows = sideSheetRows(
    [
      { pattern: 'parking:{side}', left: 'no', right: 'lane' },
      { pattern: 'parking:{side}:restriction', left: 'no_stopping' },
      { pattern: 'parking:{side}:orientation', left: 'parallel', right: 'parallel' },
      { pattern: 'parking:{side}:fee', right: 'yes' },
    ],
    'parking',
  )
  const cell = (index: number, col: 'value' | 'right') => rows[index]?.cells[col]

  it('an attribute listed for the value stays valid (parking=no with its restriction)', () => {
    expect(cell(1, 'value')?.invalid).toBeUndefined()
    expect(allowedWhenOff('parking', 'no', 'parking:{side}:restriction')).toBe(true)
    expect(allowedWhenOff('parking', 'no', 'source:parking:{side}')).toBe(true)
    expect(allowedWhenOff('parking', 'no', 'parking:{side}:restriction:hgv:conditional')).toBe(true)
    expect(allowedWhenOff('parking', 'no', 'parking:{side}:restrictions')).toBe(false)
    expect(allowedWhenOff('cycleway', 'separate', 'cycleway:{side}:lane')).toBe(false)
    expect(allowedWhenOff('cycleway', 'separate', 'cycleway:{side}:surface')).toBe(false)
  })

  it('another value on that side is invalid and says what to do; the other side is not touched', () => {
    expect(cell(2, 'value')?.invalid).toContain('parking:left')
    expect(cell(2, 'right')?.invalid).toBeUndefined()
  })

  it('an empty cell on that side is locked', () => {
    expect(cell(3, 'value')).toEqual({ value: { kind: 'value', text: '' }, readOnly: true })
    expect(cell(3, 'right')?.readOnly).toBe(false)
  })
})

describe('a key with a side entered on top (a paste, the empty row) wins over the group rows', () => {
  it('a :both key pasted on top replaces the two sides, never stands beside them', () => {
    const shown = { highway: 'residential', 'cycleway:left': 'lane', 'cycleway:right': 'lane' }
    const before = { highway: 'residential' }
    const after = { highway: 'residential', 'cycleway:both': 'track' }
    expect(shownAfterPlain(shown, before, after)).toEqual({
      highway: 'residential',
      'cycleway:left': 'track',
      'cycleway:right': 'track',
    })
  })

  it('a side key typed on top is written, a plain key removed on top goes, the rest stays', () => {
    const shown = { a: '1', 'cycleway:left': 'lane', 'cycleway:right': 'no' }
    expect(shownAfterPlain(shown, { a: '1' }, { 'cycleway:left': 'track' })).toEqual({
      'cycleway:left': 'track',
      'cycleway:right': 'no',
    })
  })

  it('for several features a :both set on top becomes its two sides', () => {
    expect(splitBothSteps([{ type: 'set', key: 'sidewalk:both', value: 'separate' }])).toEqual([
      { type: 'remove', key: 'sidewalk:both' },
      { type: 'set', key: 'sidewalk:left', value: 'separate' },
      { type: 'set', key: 'sidewalk:right', value: 'separate' },
    ])
  })
})

describe('read-only keys in the group rows', () => {
  const readOnly = (key: string) => key === 'cycleway:left:width'
  const rows = [{ pattern: 'cycleway:{side}:width', left: '1', right: '1' }]

  it('their cells are read-only, and so is the key of their row', () => {
    const [row] = sideSheetRows(rows, 'cycleway', readOnly)
    expect(row?.cells.value?.readOnly).toBe(true)
    expect(row?.cells.right?.readOnly).toBe(false)
    expect(row?.cells.key?.readOnly).toBe(true)
  })

  it('a change of their row is refused', () => {
    const result = applySideBatch(
      { 'cycleway:left:width': '1', 'cycleway:right:width': '1' },
      rows,
      {
        cause: 'edit',
        changes: [{ type: 'set', row: 'side:cycleway:{side}:width', col: 'right', text: '2' }],
      },
      readOnly,
    )
    expect(result.tags).toEqual({ 'cycleway:left:width': '1', 'cycleway:right:width': '1' })
    expect(result.refused).toHaveLength(1)
  })
})
