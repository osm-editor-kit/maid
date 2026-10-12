import { describe, expect, test } from 'bun:test'
import { distanceMetres, formatMetres, measureFeatures } from './measure'

describe('distanceMetres', () => {
  test('is zero for the same place', () => {
    expect(distanceMetres([13.4, 52.5], [13.4, 52.5])).toBe(0)
  })

  test('is the same in both directions', () => {
    const a: [number, number] = [13.4, 52.5]
    const b: [number, number] = [13.4123, 52.5087]
    expect(distanceMetres(a, b)).toBe(distanceMetres(b, a))
  })

  test('one degree of latitude is about 111.2 km everywhere', () => {
    expect(distanceMetres([0, 0], [0, 1])).toBeCloseTo(111195, -1)
    expect(distanceMetres([0, 60], [0, 61])).toBeCloseTo(111195, -1)
  })

  test('one degree of longitude shrinks with the cosine of the latitude', () => {
    expect(distanceMetres([0, 0], [1, 0])).toBeCloseTo(111195, -1)
    expect(distanceMetres([0, 60], [1, 60])).toBeCloseTo(111195 / 2, -1)
  })

  test('a short distance in Berlin is in metres', () => {
    // 0.0001 degrees of latitude is about 11.1 m
    expect(distanceMetres([13.4, 52.5], [13.4, 52.5001])).toBeCloseTo(11.1, 1)
  })
})

describe('formatMetres', () => {
  test('keeps one decimal', () => {
    expect(formatMetres(3.4)).toBe('3.4')
    expect(formatMetres(12.5)).toBe('12.5')
  })

  test('drops a trailing .0', () => {
    expect(formatMetres(3)).toBe('3')
    expect(formatMetres(3.02)).toBe('3')
  })

  test('rounds to one decimal', () => {
    expect(formatMetres(3.44)).toBe('3.4')
    expect(formatMetres(3.46)).toBe('3.5')
  })
})

describe('measureFeatures', () => {
  const start: [number, number] = [13.4, 52.5]
  const end: [number, number] = [13.4, 52.5001]

  test('a line between the two places, and a label with the distance', () => {
    const [line, label] = measureFeatures(start, end)
    expect(line?.properties?.state).toBe('measure-line')
    expect(line?.geometry).toEqual({ type: 'LineString', coordinates: [start, end] })
    expect(label?.properties?.state).toBe('measure-label')
    expect(label?.properties?.label).toBe('11.1 m')
  })

  test('the label sits in the middle of the line', () => {
    const [, label] = measureFeatures(start, end)
    expect(label?.geometry).toEqual({
      type: 'Point',
      coordinates: [13.4, (52.5 + 52.5001) / 2],
    })
  })

  test('the label has no trailing .0 for a whole distance', () => {
    const [, label] = measureFeatures([13.4, 52.5], [13.4, 52.5])
    expect(label?.properties?.label).toBe('0 m')
  })
})
