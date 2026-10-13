import { describe, expect, it } from 'bun:test'
import { groupLayers } from '@osm-editor-kit/maplibre-editor-layer-index'
import type { Listing } from './helpers.ts'
import { filterSeriesRows, seriesRows } from './series.ts'

/**
 * Hand-made layers in the shape ELI's hydrated layers have (see the README of the package, section
 * "Time series"). The Berlin series has three dates here; `order` 0 is the oldest.
 */
const SERIES = { id: 'berlin-geoportal-dop20rgb', name: 'Berlin/Geoportal DOP20RGB' }

function dated(
  date: { id: string; label: string; order: number },
  overrides: Partial<Listing> = {},
): Listing {
  return {
    id: date.id,
    name: `${SERIES.name} (${date.label})`,
    category: 'photo',
    best: false,
    overlay: false,
    group: { ...SERIES, label: date.label, order: date.order },
    attributionText: `Geoportal Berlin ${date.label}`,
    ...overrides,
  }
}

const DOP_2024 = { id: 'berlin-dop-2024', label: '2024', order: 7 }
const DOP_2025 = { id: 'berlin-dop-2025-summer', label: '2025 Sommer', order: 8 }
const DOP_2026 = { id: 'berlin-dop-2026', label: '2026', order: 9 }

const standalone: Listing = {
  id: 'example-aerial',
  name: 'Example standalone aerial',
  category: 'photo',
  best: false,
  overlay: false,
  attributionText: 'Example provider',
}

/** The three dates of the series, 2026 marked best */
function berlinSeries(): Listing[] {
  return [dated(DOP_2024), dated(DOP_2025), dated(DOP_2026, { best: true })]
}

describe('seriesRows', () => {
  it('shows a series as one row, its dates newest first, the best one marked', () => {
    const rows = seriesRows(groupLayers(berlinSeries()), null)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row?.name).toBe('Berlin/Geoportal DOP20RGB')
    expect(row?.chips.map((chip) => chip.label)).toEqual(['2026', '2025 Sommer', '2024'])
    expect(row?.chips.filter((chip) => chip.best).map((chip) => chip.label)).toEqual(['2026'])
    expect(row?.best).toBe(true)
    expect(row?.defaultId).toBe('berlin-dop-2026')
    expect(row?.selected).toBe(false)
  })

  it('files a series under the category of its newest date', () => {
    const layers = [dated(DOP_2024, { category: 'historicphoto' }), dated(DOP_2026)]
    const [row] = seriesRows(groupLayers(layers), null)
    expect(row?.category).toBe('Aerial photo')
  })

  it('shows a standalone layer as a row without dates, selected by its own id', () => {
    const entries = groupLayers([standalone])
    const [row] = seriesRows(entries, 'example-aerial')
    expect(row?.key).toBe('example-aerial')
    expect(row?.chips).toEqual([])
    expect(row?.selected).toBe(true)
    expect(row?.defaultId).toBe('example-aerial')
    expect(seriesRows(entries, null)[0]?.selected).toBe(false)
  })

  it('offers only the dates that cover the view, when the view filter ran first', () => {
    // 2025 does not cover this view, so it is not passed to the grouping
    const inView = berlinSeries().filter((layer) => layer.id !== DOP_2025.id)
    const [row] = seriesRows(groupLayers(inView), null)
    expect(row?.chips.map((chip) => chip.label)).toEqual(['2026', '2024'])
    expect(row?.defaultId).toBe('berlin-dop-2026')
  })

  it('selects the row and marks only the chip of the date that is drawn', () => {
    const [row] = seriesRows(groupLayers(berlinSeries()), 'berlin-dop-2025-summer')
    expect(row?.selected).toBe(true)
    expect(row?.chips.map((chip) => [chip.label, chip.active])).toEqual([
      ['2026', false],
      ['2025 Sommer', true],
      ['2024', false],
    ])
  })

  it('keeps an older date chosen in a stored choice, and the row still selects the default', () => {
    const [row] = seriesRows(groupLayers(berlinSeries()), 'berlin-dop-2024')
    expect(row?.selected).toBe(true)
    expect(row?.chips.find((chip) => chip.active)?.label).toBe('2024')
    expect(row?.defaultId).toBe('berlin-dop-2026')
  })

  it('selects nothing when the stored choice is not in the list', () => {
    const rows = seriesRows(groupLayers(berlinSeries()), 'berlin-dop-2019')
    expect(rows[0]?.selected).toBe(false)
    expect(rows[0]?.chips.some((chip) => chip.active)).toBe(false)
  })

  it('gives each date its own name, the name iD cites for it', () => {
    const [row] = seriesRows(groupLayers(berlinSeries()), null)
    expect(row?.chips.find((chip) => chip.id === 'berlin-dop-2024')?.name).toBe(
      'Berlin/Geoportal DOP20RGB (2024)',
    )
  })

  it('gives the attribution of the drawn date, or of the default while none is drawn', () => {
    const entries = groupLayers(berlinSeries())
    expect(seriesRows(entries, 'berlin-dop-2024')[0]?.attributionText).toBe('Geoportal Berlin 2024')
    expect(seriesRows(entries, null)[0]?.attributionText).toBe('Geoportal Berlin 2026')
  })

  it('lists the best rows first, then by name', () => {
    const rows = seriesRows(
      groupLayers([
        { ...standalone, id: 'zeta', name: 'Zeta' },
        { ...standalone, id: 'alpha', name: 'Alpha' },
        ...berlinSeries(),
      ]),
      null,
    )
    expect(rows.map((row) => row.name)).toEqual(['Berlin/Geoportal DOP20RGB', 'Alpha', 'Zeta'])
  })
})

describe('filterSeriesRows', () => {
  const rows = seriesRows(groupLayers([...berlinSeries(), standalone]), null)

  it('matches the series name, a date label and the category, case-insensitively', () => {
    expect(filterSeriesRows(rows, 'BERLIN').map((row) => row.key)).toEqual([
      'berlin-geoportal-dop20rgb',
    ])
    expect(filterSeriesRows(rows, 'sommer').map((row) => row.key)).toEqual([
      'berlin-geoportal-dop20rgb',
    ])
    expect(filterSeriesRows(rows, 'aerial photo').map((row) => row.key)).toEqual([
      'berlin-geoportal-dop20rgb',
      'example-aerial',
    ])
  })

  it('needs every word, and an empty query shows every row', () => {
    expect(filterSeriesRows(rows, 'berlin 2025')).toHaveLength(1)
    expect(filterSeriesRows(rows, 'berlin 2019')).toHaveLength(0)
    expect(filterSeriesRows(rows, '   ')).toHaveLength(2)
  })
})
