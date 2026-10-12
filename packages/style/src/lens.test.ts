import { describe, expect, test } from 'bun:test'
import {
  DIM_OPACITY,
  describeMatch,
  lensColour,
  lensFill,
  lensStyle,
  matchesTags,
  parseColour,
  scaleAlpha,
  withAlpha,
  type Lens,
} from './lens'

const roads: Lens = {
  id: 'roads',
  name: 'Roads',
  rules: [
    { match: { highway: 'primary' }, color: '#111111', width: 6 },
    { match: { highway: ['residential', 'service'] }, color: '#222222', dash: [4, 2] },
    { match: { highway: true }, color: '#333333', opacity: 0.5 },
  ],
}

describe('lensStyle: rules', () => {
  test('the first matching rule decides', () => {
    expect(lensStyle(roads, { highway: 'primary' }, 'line')).toEqual({
      color: '#111111',
      width: 6,
    })
  })

  test('a list of values matches any of them', () => {
    expect(lensStyle(roads, { highway: 'service' }, 'line')).toEqual({
      color: '#222222',
      dash: [4, 2],
    })
  })

  test('true matches any value, and a later rule catches what an earlier one did not', () => {
    expect(lensStyle(roads, { highway: 'track' }, 'line')).toEqual({
      color: '#333333',
      opacity: 0.5,
    })
  })

  test('every key of a match must hold', () => {
    const lens: Lens = {
      id: 'x',
      name: 'x',
      rules: [{ match: { highway: 'primary', surface: 'asphalt' }, color: '#abcdef' }],
    }
    expect(lensStyle(lens, { highway: 'primary', surface: 'asphalt' }, 'line')?.color).toBe(
      '#abcdef',
    )
    expect(lensStyle(lens, { highway: 'primary', surface: 'gravel' }, 'line')).toEqual({
      opacity: DIM_OPACITY,
    })
  })

  test('false matches a missing tag and only that', () => {
    expect(matchesTags({ surface: false }, { highway: 'path' })).toBe(true)
    expect(matchesTags({ surface: false }, { surface: 'paved' })).toBe(false)
    expect(matchesTags({ surface: true }, { surface: 'paved' })).toBe(true)
    expect(matchesTags({ surface: true }, {})).toBe(false)
  })

  test('an empty match matches every feature', () => {
    expect(matchesTags({}, {})).toBe(true)
  })
})

describe('lensStyle: geometry and rest', () => {
  test('a lens with a geometry limit leaves other geometries alone', () => {
    const lens: Lens = { ...roads, geometry: ['line'] }
    expect(lensStyle(lens, { highway: 'primary' }, 'area')).toBeUndefined()
    expect(lensStyle(lens, { highway: 'primary' }, 'line')?.color).toBe('#111111')
  })

  test('rest defaults to dim: unmatched features get the dim opacity', () => {
    const lens: Lens = { id: 'x', name: 'x', rules: [{ match: { highway: 'primary' } }] }
    expect(lensStyle(lens, { building: 'yes' }, 'area')).toEqual({ opacity: DIM_OPACITY })
  })

  test('rest normal leaves unmatched features as they are', () => {
    const lens: Lens = { id: 'x', name: 'x', rest: 'normal', rules: [] }
    expect(lensStyle(lens, { building: 'yes' }, 'area')).toBeUndefined()
  })

  test('rest hide hides unmatched features', () => {
    const lens: Lens = { id: 'x', name: 'x', rest: 'hide', rules: [] }
    expect(lensStyle(lens, { building: 'yes' }, 'area')).toEqual({ hidden: true })
  })

  test('a matched rule is never hidden or dimmed', () => {
    const lens: Lens = { id: 'x', name: 'x', rest: 'hide', rules: [{ match: { a: true } }] }
    expect(lensStyle(lens, { a: '1' }, 'line')).toEqual({})
  })
})

describe('colours', () => {
  test('parseColour reads hex, rgb and rgba, and nothing else', () => {
    expect(parseColour('#abc')).toEqual([170, 187, 204, 1])
    expect(parseColour('#AABBCC')).toEqual([170, 187, 204, 1])
    expect(parseColour('rgb(224, 110, 95)')).toEqual([224, 110, 95, 1])
    expect(parseColour('rgba(140, 208, 95, 0.3)')).toEqual([140, 208, 95, 0.3])
    expect(parseColour('white')).toBeUndefined()
  })

  test('scaleAlpha multiplies the alpha, and an unreadable colour is returned as it is', () => {
    expect(scaleAlpha('rgba(140, 208, 95, 0.3)', 0.5)).toBe('rgba(140, 208, 95, 0.15)')
    expect(scaleAlpha('rgb(0, 0, 0)', DIM_OPACITY)).toBe('rgba(0, 0, 0, 0.25)')
    expect(scaleAlpha('white', 0.5)).toBe('white')
  })

  test('withAlpha sets the alpha', () => {
    expect(withAlpha('#ff0000', 0.4)).toBe('rgba(255, 0, 0, 0.4)')
  })

  test('lensColour: a rule colour without opacity is used as written', () => {
    expect(lensColour({ color: '#123456' }, 'rgb(1, 2, 3)')).toBe('#123456')
  })

  test('lensColour: no colour on the feature and no colour from the lens stays undefined', () => {
    expect(lensColour({ opacity: 0.5 }, undefined)).toBeUndefined()
    expect(lensColour({ hidden: true }, '#000')).toBe('#000')
  })

  test('lensColour: a dimmed feature keeps its colour at lower alpha', () => {
    expect(lensColour({ opacity: DIM_OPACITY }, '#000000')).toBe('rgba(0, 0, 0, 0.25)')
  })

  test('lensFill: a rule colour fills at the fill alpha, an area without fill gets none', () => {
    expect(lensFill({ color: '#ff0000' }, 'rgba(0, 0, 0, 0.5)')).toBe('rgba(255, 0, 0, 0.3)')
    expect(lensFill({ color: '#ff0000' }, undefined)).toBeUndefined()
    expect(lensFill({ opacity: DIM_OPACITY }, 'rgba(10, 20, 30, 0.5)')).toBe(
      'rgba(10, 20, 30, 0.125)',
    )
  })

  test('describeMatch reads a match as a legend line', () => {
    expect(describeMatch({ surface: ['asphalt', 'paved'] })).toBe('surface: asphalt, paved')
    expect(describeMatch({ surface: false, lit: true })).toBe('surface is missing, lit is set')
    expect(describeMatch({})).toBe('every feature')
  })
})
