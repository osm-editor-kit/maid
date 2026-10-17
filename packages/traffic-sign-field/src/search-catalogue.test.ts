import { describe, expect, it } from 'bun:test'
import type { SignType } from '@osm-traffic-signs/converter'
import { trafficSignData } from '@osm-traffic-signs/converter/data/DE'
import { isExcludedByCompatibility } from './compatibility.ts'
import { isPromotedSign, searchCatalogue } from './search-catalogue.ts'

const sign = (overrides: Partial<SignType>): SignType =>
  ({
    osmValuePart: '240',
    signId: '240',
    name: 'Zeichen 240',
    descriptiveName: 'Gemeinsamer Geh- und Radweg',
    description: null,
    kind: 'traffic_sign',
    catalogue: { signCategory: 'traffic_sign' },
    ...overrides,
  }) as SignType

const catalogue = [
  sign({}),
  sign({
    osmValuePart: '244.1',
    signId: '244.1',
    name: 'Zeichen 244.1',
    descriptiveName: 'Fahrradstraße',
  }),
  sign({
    osmValuePart: '274[30]',
    signId: '274',
    name: 'Zeichen 274',
    descriptiveName: 'Zulässige Höchstgeschwindigkeit 30',
    description: 'Tempolimit auf 30 km/h',
  }),
  sign({
    osmValuePart: '274.1',
    signId: '274.1',
    name: 'Zeichen 274.1',
    descriptiveName: 'Tempo 30-Zone',
    catalogue: { signCategory: 'traffic_sign', focus: { default: 'highlight' } },
  }),
]
const ids = (signs: SignType[]) => signs.map((s) => s.signId)

describe('searchCatalogue', () => {
  it('an empty query lists everything, promoted first, then in catalogue order', () => {
    expect(ids(searchCatalogue(catalogue, ''))).toEqual(['274.1', '240', '244.1', '274'])
  })
  it('a query of spaces is empty', () => {
    expect(searchCatalogue(catalogue, '   ')).toHaveLength(catalogue.length)
  })
  it('the exact id comes before the id prefix', () => {
    expect(ids(searchCatalogue(catalogue, '274'))).toEqual(['274', '274.1'])
  })
  it('the id prefix comes before a name match', () => {
    const result = searchCatalogue(
      [
        sign({ signId: '9', osmValuePart: '9', name: 'Zeichen 9', descriptiveName: '24 Stunden' }),
        ...catalogue,
      ],
      '24',
    )
    expect(ids(result).slice(0, 3)).toEqual(['240', '244.1', '9'])
  })
  it('a name prefix ranks above a word inside a name, a word above a substring', () => {
    const result = searchCatalogue(catalogue, 'tempo')
    expect(result[0]?.descriptiveName).toBe('Tempo 30-Zone')
    expect(ids(result)).toContain('274') // the description
    expect(ids(searchCatalogue(catalogue, 'weg'))).toEqual(['240']) // inside "Radweg"
  })
  it('the highlight breaks a tie between equal scores', () => {
    const tied = [
      sign({ signId: 'a', osmValuePart: 'a', name: 'Alpha', descriptiveName: 'Rad eins' }),
      sign({
        signId: 'b',
        osmValuePart: 'b',
        name: 'Beta',
        descriptiveName: 'Rad zwei',
        catalogue: { signCategory: 'traffic_sign', focus: { bike_foot: 'highlight' } },
      }),
    ]
    expect(ids(searchCatalogue(tied, 'rad'))).toEqual(['b', 'a'])
  })
  it('exclude hides signs', () => {
    const result = searchCatalogue(catalogue, '274', { exclude: (s) => s.signId === '274' })
    expect(ids(result)).toEqual(['274.1'])
  })
  it('is case-insensitive and finds nothing for nonsense', () => {
    expect(ids(searchCatalogue(catalogue, 'FAHRRAD'))).toEqual(['244.1'])
    expect(searchCatalogue(catalogue, 'zzzzzz')).toEqual([])
  })
})

describe('on the DE catalogue', () => {
  it('274 finds the speed limit sign first, by id', () => {
    const [first] = searchCatalogue(trafficSignData, '274')
    expect(first?.signId).toBe('274')
  })
  it('a word of a modifier name finds it', () => {
    const result = searchCatalogue(trafficSignData, 'Kfz')
    expect(result.length).toBeGreaterThan(0)
    expect(result.some((s) => s.kind !== 'traffic_sign')).toBe(true)
  })
  it('knows 18 or so promoted signs', () => {
    expect(trafficSignData.filter(isPromotedSign).length).toBeGreaterThan(0)
  })
})

describe('isExcludedByCompatibility', () => {
  const a = sign({
    signId: 'a',
    osmValuePart: 'a',
    compatibility: { incompatibleModifiers: ['b'] },
  })
  const b = sign({ signId: 'b', osmValuePart: 'b' })
  const c = sign({ signId: 'c', osmValuePart: 'c' })
  it('works in both directions, as the data is not symmetric', () => {
    expect(isExcludedByCompatibility(b, [a])).toBe(true)
    expect(isExcludedByCompatibility(a, [b])).toBe(true)
    expect(isExcludedByCompatibility(c, [a])).toBe(false)
    expect(isExcludedByCompatibility(c, [])).toBe(false)
  })
})
