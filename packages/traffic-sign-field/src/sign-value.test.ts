import { describe, expect, it } from 'bun:test'
import { signsToTrafficSignTagValue, trafficSignTagToSigns } from '@osm-traffic-signs/converter'
import { trafficSignData } from '@osm-traffic-signs/converter/data/DE'
import {
  formatSignValue,
  parseSignValue,
  resolveCountry,
  splitSignIdSignValue,
  type SignEntry,
} from './sign-value.ts'

const parse = (value: string) => parseSignValue(value, 'DE', trafficSignData)
const roundTrip = (value: string) => formatSignValue(parse(value), 'DE')

describe('round trip over the DE catalogue', () => {
  it.each([
    'DE:274-30',
    'DE:274-30,1000-31',
    'DE:240,1000-31',
    'DE:240;310',
    'none',
    'DE:"Kfz-Verkehr frei"',
  ])('keeps %s', (value) => {
    expect(roundTrip(value)).toBe(value)
  })

  it('writes the catalogue default of a sign with a value prompt, and is stable after that', () => {
    const once = roundTrip('DE:274')
    expect(once).toBe('DE:274[47]')
    expect(roundTrip(once ?? '')).toBe(once)
  })

  it('keeps an unknown code as a row and writes it back', () => {
    const entries = parse('DE:274-30,999999')
    expect(entries.map((e) => [e.part, e.sign !== undefined])).toEqual([
      ['274-30', true],
      ['999999', false],
    ])
    expect(formatSignValue(entries, 'DE')).toBe('DE:274-30,999999')
  })

  it('keeps unknown main signs, named values and free text together', () => {
    const value = 'city_limit;DE:310;foo'
    const entries = parse(value)
    expect(entries.map((e) => e.part)).toEqual(['city_limit', '310', 'foo'])
    expect(formatSignValue(entries, 'DE')).toBe(value)
  })

  it('without a catalogue every part is an unknown row and none is lost', () => {
    const entries = parseSignValue('DE:274-30,1000-31', 'DE', [])
    expect(entries.map((e) => e.part)).toEqual(['274-30', '1000-31'])
    expect(entries.every((e) => e.sign === undefined)).toBe(true)
  })

  it('an empty list writes no value', () => {
    expect(formatSignValue([], 'DE')).toBeUndefined()
    expect(parse('')).toEqual([])
    expect(parseSignValue(undefined, 'DE', trafficSignData)).toEqual([])
  })

  it('a modifier after a sign joins with a comma, a main sign with a semicolon', () => {
    const [sign, modifier] = parse('DE:274-30,1000-31') as [SignEntry, SignEntry]
    expect(formatSignValue([sign, modifier, sign], 'DE')).toBe('DE:274-30,1000-31;274-30')
    expect(formatSignValue([modifier, sign], 'DE')).toBe('DE:1000-31;274-30')
  })
})

describe('the same result as the converter (main entry, test only)', () => {
  const values = [
    'DE:274-30',
    'DE:274-30,1000-31',
    'DE:274',
    'DE:274[50],1000-31',
    'DE:240;DE:1000-31',
    'DE:274[30]',
    'DE:"Kfz-Verkehr frei"',
    'DE:274-30,999999',
    'none',
  ]
  it.each(values)('%s', (value) => {
    const signs = trafficSignTagToSigns(value, 'DE')
    expect(roundTrip(value)).toBe(signsToTrafficSignTagValue(signs, 'DE'))
    expect(parse(value).map((e) => e.part)).toEqual(signs.map((s) => s.osmValuePart))
    expect(parse(value).map((e) => e.sign !== undefined)).toEqual(
      signs.map((s) => s.recodgnizedSign),
    )
  })
})

describe('resolveCountry', () => {
  it('a known prefix in the value wins over the option', () => {
    expect(resolveCountry('AT:274-30', 'DE')).toBe('AT')
  })
  it('an unknown prefix or none falls back', () => {
    expect(resolveCountry('XX:274', 'DE')).toBe('DE')
    expect(resolveCountry('274-30', 'FR')).toBe('FR')
    expect(resolveCountry(undefined, 'DE')).toBe('DE')
  })
})

describe('splitSignIdSignValue', () => {
  it('splits an id and its value', () => {
    expect(splitSignIdSignValue('274[47]')).toEqual({ signId: '274', signValue: '47' })
    expect(splitSignIdSignValue('"a[b]"')).toEqual({ signId: '"a[b]"', signValue: undefined })
  })
})
