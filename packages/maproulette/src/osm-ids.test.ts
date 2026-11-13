import { describe, expect, test } from 'bun:test'
import {
  collectOsmEntityIds,
  collectOsmEntityIdsFromGeometries,
  longFormOsmId,
  parseOsmEntityIdFromFeatureProperties,
  splitOsmReferences,
  toLongFormOsmId,
} from './osm-ids.ts'

describe('longFormOsmId', () => {
  test('converts short ids to way/node/relation form', () => {
    expect(longFormOsmId('w123')).toBe('way/123')
    expect(longFormOsmId('n456')).toBe('node/456')
    expect(longFormOsmId('r789')).toBe('relation/789')
  })

  test('toLongFormOsmId takes both forms', () => {
    expect(toLongFormOsmId('W5')).toBe('way/5')
    expect(toLongFormOsmId('Way/5')).toBe('way/5')
    expect(toLongFormOsmId(' other ')).toBe('other')
  })
})

describe('collectOsmEntityIds', () => {
  test('empty or invalid input', () => {
    expect(collectOsmEntityIds()).toEqual([])
    expect(collectOsmEntityIds(null, undefined, '', '   ')).toEqual([])
    expect(collectOsmEntityIds(false, {}, [])).toEqual([])
    expect(collectOsmEntityIds('no osm ids here', 12345)).toEqual([])
  })

  test('title forms', () => {
    expect(collectOsmEntityIds('w123@0')).toEqual(['w123'])
    expect(collectOsmEntityIds('n456@1')).toEqual(['n456'])
    expect(collectOsmEntityIds('r789@42')).toEqual(['r789'])
    expect(collectOsmEntityIds('W123@0')).toEqual(['w123'])
  })

  test('long form and short form in free text', () => {
    expect(collectOsmEntityIds('way/123')).toEqual(['w123'])
    expect(collectOsmEntityIds('Fix way/111 and relation/222 nearby')).toEqual(['w111', 'r222'])
    expect(collectOsmEntityIds('see n456 and r789')).toEqual(['n456', 'r789'])
  })

  test('deduplicates across values and nested fields', () => {
    const result = collectOsmEntityIds(
      'w123@0',
      'way/123',
      { title: 'w123', osmId: 'w123', name: 'way/123' },
      ['w123', 'n456'],
      'n456',
    )
    expect(result.sort()).toEqual(['n456', 'w123'])
  })

  test('preferred identity keys', () => {
    const task = {
      title: 'w100@0',
      name: 'node/200',
      osmId: 'r300',
      osm_id: 'w400',
      osmid: 'n500',
      id: 'r600',
      identifier: 'way/700',
    }
    expect(collectOsmEntityIds(task).sort()).toEqual([
      'n200',
      'n500',
      'r300',
      'r600',
      'w100',
      'w400',
      'w700',
    ])
  })

  test('nested arrays and trimmed strings', () => {
    expect(
      collectOsmEntityIds(['  w111@0  ', [{ title: 'n222@1' }, 'relation/333']]).sort(),
    ).toEqual(['n222', 'r333', 'w111'])
  })

  test('skips coordinate blobs but reads feature properties and titles', () => {
    const feature = {
      geometry: {
        type: 'Point',
        coordinates: [0, 0],
        properties: { id: 'w999' },
      },
      geometries: [{ id: 'n888' }],
      coordinates: [[0, 0]],
      properties: { osmId: 'w123' },
      title: 'n456@0',
    }
    expect(collectOsmEntityIds(feature).sort()).toEqual(['n456', 'w123'])
  })

  test('stops walking beyond the depth limit', () => {
    let deep: unknown = 'w123'
    for (let i = 0; i < 6; i++) deep = { nested: deep }
    expect(collectOsmEntityIds(deep)).toEqual([])
    let reachable: unknown = 'w123'
    for (let i = 0; i < 5; i++) reachable = { nested: reachable }
    expect(collectOsmEntityIds(reachable)).toEqual(['w123'])
  })

  test('mixed MapRoulette-like sources in one call', () => {
    const task = {
      id: 987654,
      title: 'w42@0',
      name: 'Crossing at way/99',
      properties: { comment: 'Also check n77', tags: { source: 'survey' } },
    }
    const feature = { id: 'feature/1', properties: { osm_id: 'r55' } }
    expect(collectOsmEntityIds(task, feature, 'relation/11').sort()).toEqual([
      'n77',
      'r11',
      'r55',
      'w42',
      'w99',
    ])
  })

  test('reads @id from task.geometries features (V4)', () => {
    const task = {
      title: 'unrelated',
      geometries: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { '@id': 'way/12345' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          },
        ],
      },
    }
    expect(collectOsmEntityIds(task)).toEqual(['w12345'])
  })

  test('infers node or way from numeric osmid and geometry type (V4)', () => {
    expect(
      collectOsmEntityIds({
        type: 'Feature',
        properties: { osmid: 111 },
        geometry: { type: 'Point', coordinates: [1, 2] },
      }),
    ).toEqual(['n111'])
    expect(
      collectOsmEntityIds({
        type: 'Feature',
        properties: { osm_id: 222 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 0],
          ],
        },
      }),
    ).toEqual(['w222'])
  })

  test('merges title, V4 @id and body text without duplicates', () => {
    const task = {
      title: 'w1@0',
      instruction: 'Also fix way/1 and check n9',
      geometries: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { '@id': 'way/1' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          },
        ],
      },
    }
    expect(collectOsmEntityIds(task).sort()).toEqual(['n9', 'w1'])
  })

  test('does not invent ids from a bare numeric properties.id', () => {
    expect(
      collectOsmEntityIds({
        type: 'Feature',
        properties: { id: 123 },
        geometry: { type: 'Point', coordinates: [0, 0] },
      }),
    ).toEqual([])
  })
})

describe('parseOsmEntityIdFromFeatureProperties', () => {
  test('typed @id, id and osm_id strings', () => {
    expect(parseOsmEntityIdFromFeatureProperties({ '@id': 'way/12345' })).toBe('w12345')
    expect(parseOsmEntityIdFromFeatureProperties({ id: 'node/1' })).toBe('n1')
    expect(parseOsmEntityIdFromFeatureProperties({ osm_id: 'relation/789' })).toBe('r789')
  })

  test('explicit @type and osm_type with numeric ids', () => {
    expect(parseOsmEntityIdFromFeatureProperties({ osmid: 111, '@type': 'Node' })).toBe('n111')
    expect(parseOsmEntityIdFromFeatureProperties({ osm_id: 222, osm_type: 'way' })).toBe('w222')
  })

  test('rejects short forms and bare numeric ids', () => {
    expect(parseOsmEntityIdFromFeatureProperties({ '@id': 'w123' })).toBe(null)
    expect(parseOsmEntityIdFromFeatureProperties({ id: 123 }, 'Point')).toBe(null)
    expect(parseOsmEntityIdFromFeatureProperties({ osmid: 0 }, 'Point')).toBe(null)
    expect(parseOsmEntityIdFromFeatureProperties(null)).toBe(null)
  })
})

describe('collectOsmEntityIdsFromGeometries', () => {
  test('collects from every feature, not only the first', () => {
    expect(
      collectOsmEntityIdsFromGeometries({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { '@id': 'way/1' },
            geometry: { type: 'LineString', coordinates: [] },
          },
          {
            type: 'Feature',
            properties: { '@id': 'node/2' },
            geometry: { type: 'Point', coordinates: [0, 0] },
          },
        ],
      }).sort(),
    ).toEqual(['n2', 'w1'])
  })
})

describe('splitOsmReferences', () => {
  test('long and short references between text', () => {
    expect(splitOsmReferences('Fix way/12 and n5.')).toEqual([
      { type: 'text', text: 'Fix ' },
      { type: 'osm', osmId: 'way/12', label: 'way/12' },
      { type: 'text', text: ' and ' },
      { type: 'osm', osmId: 'node/5', label: 'n5' },
      { type: 'text', text: '.' },
    ])
  })

  test('urls and words that only contain an id are left alone', () => {
    expect(splitOsmReferences('see https://www.openstreetmap.org/way/12 or abcw12')).toEqual([
      {
        type: 'text',
        text: 'see https://www.openstreetmap.org/way/12 or abcw12',
      },
    ])
  })

  test('no text', () => {
    expect(splitOsmReferences('')).toEqual([])
  })
})
