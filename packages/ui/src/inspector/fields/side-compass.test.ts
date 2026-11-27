import { describe, expect, test } from 'bun:test'
import {
  compassPoint,
  normaliseDegrees,
  screenToBearing,
  sideCompass,
  sideDirection,
} from './side-compass.ts'

describe('compassPoint', () => {
  test('the eight points and their borders', () => {
    expect(compassPoint(0)).toBe('n')
    expect(compassPoint(22.4)).toBe('n')
    expect(compassPoint(22.6)).toBe('ne')
    expect(compassPoint(90)).toBe('e')
    expect(compassPoint(135)).toBe('se')
    expect(compassPoint(180)).toBe('s')
    expect(compassPoint(225)).toBe('sw')
    expect(compassPoint(270)).toBe('w')
    expect(compassPoint(315)).toBe('nw')
    expect(compassPoint(337.6)).toBe('n')
    expect(compassPoint(-45)).toBe('nw')
    expect(compassPoint(720)).toBe('n')
  })
})

describe('sideDirection', () => {
  test('left is a quarter turn against the clock, right a quarter turn with it', () => {
    expect(sideDirection(0, 'left')).toBe(270)
    expect(sideDirection(0, 'right')).toBe(90)
    expect(sideDirection(45, 'left')).toBe(315)
    expect(sideDirection(300, 'right')).toBe(30)
  })
})

describe('screenToBearing', () => {
  test('a north-up map: the screen angle is the bearing', () => {
    expect(screenToBearing(90, 0)).toBe(90)
  })
  test('a map turned so that east is up: up on screen is east', () => {
    expect(screenToBearing(0, 90)).toBe(90)
    expect(screenToBearing(270, 90)).toBe(0)
  })
  test('normalises', () => {
    expect(normaliseDegrees(-90)).toBe(270)
    expect(screenToBearing(300, 120)).toBe(60)
  })
})

describe('sideCompass', () => {
  test('a way drawn eastwards on a north-up map: left faces north, right south', () => {
    expect(sideCompass(90, 0, 'left')).toEqual({ rotation: 90, compass: 'n' })
    expect(sideCompass(90, 0, 'right')).toEqual({ rotation: 90, compass: 's' })
  })
  test('a way drawn north-east: left faces north-west', () => {
    expect(sideCompass(45, 0, 'left')?.compass).toBe('nw')
    expect(sideCompass(45, 0, 'right')?.compass).toBe('se')
  })
  test('the map turns: the piece turns on screen, the compass point stays', () => {
    // the same eastward way on a map turned by 90° (east up) runs up the screen
    expect(sideCompass(0, 90, 'left')).toEqual({ rotation: 0, compass: 'n' })
    expect(sideCompass(0, 90, 'right')).toEqual({ rotation: 0, compass: 's' })
  })
  test('no heading: nothing to show', () => {
    expect(sideCompass(undefined, 0, 'left')).toBeUndefined()
  })
})
