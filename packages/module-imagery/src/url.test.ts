import { describe, expect, it } from 'bun:test'
import { createUrlParams } from '@osm-editor-kit/maid-core'
import { BRIGHTNESS_MAX, BRIGHTNESS_MIN } from './helpers.ts'
import {
  DISPLAY_RANGES,
  ID_BACKGROUND,
  ID_OVERLAYS,
  NONE,
  parseAsBackground,
  parseAsBgDisplay,
  parseAsOverlays,
  readDisplayList,
  customValue,
  templateOf,
  isOwnValue,
} from './url.ts'

/** The value the URL carries: nuqs encodes it, and URLSearchParams decodes it, so the round trip goes through both */
function throughUrl(name: string, value: string) {
  const search = new URLSearchParams()
  search.set(name, value)
  return new URLSearchParams(search.toString()).get(name)
}

describe('bg parser', () => {
  it('reads an ELI id, none, and a custom template', () => {
    expect(parseAsBackground.parse('Bing')).toBe('Bing')
    expect(parseAsBackground.parse(NONE)).toBe('none')
    expect(parseAsBackground.parse('custom:https://a.example/{z}/{x}/{y}.png')).toBe(
      'custom:https://a.example/{z}/{x}/{y}.png',
    )
  })

  it('gives no opinion for an empty value or a custom with no template', () => {
    expect(parseAsBackground.parse('')).toBeNull()
    expect(parseAsBackground.parse('custom:')).toBeNull()
  })

  it('round trips a custom template with &, braces and spaces through the URL', () => {
    const template = 'https://tiles.example.org/{z}/{x}/{y}.png?key=a b&style=2&size={width}'
    const value = customValue(template)
    const back = parseAsBackground.parse(throughUrl('bg', parseAsBackground.serialize(value)) ?? '')
    expect(back).toBe(value)
    expect(templateOf(back ?? '')).toBe(template)
  })

  it('knows its own values: none and custom need no index', () => {
    expect(isOwnValue(NONE)).toBe(true)
    expect(isOwnValue(customValue('https://a.example/{z}/{x}/{y}.png'))).toBe(true)
    expect(isOwnValue('Bing')).toBe(false)
    expect(templateOf('Bing')).toBeNull()
  })
})

describe('overlays parser', () => {
  it('keeps the order chosen', () => {
    const ids = ['roads', 'dop', 'boundaries']
    expect(parseAsOverlays.parse(parseAsOverlays.serialize(ids))).toEqual(ids)
  })

  it('writes an empty list as none, and reads none as an empty list', () => {
    expect(parseAsOverlays.serialize([])).toBe('none')
    expect(parseAsOverlays.parse('none')).toEqual([])
  })

  it('round trips an empty list through the URL', () => {
    const back = parseAsOverlays.parse(throughUrl('overlays', parseAsOverlays.serialize([])) ?? '')
    expect(back).toEqual([])
  })

  it('drops repeats and empty parts, and gives no opinion without an id', () => {
    expect(parseAsOverlays.parse('a,,b,a')).toEqual(['a', 'b'])
    expect(parseAsOverlays.parse(',')).toBeNull()
    expect(parseAsOverlays.parse('')).toBeNull()
  })

  it('compares lists in order', () => {
    expect(parseAsOverlays.eq?.(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(parseAsOverlays.eq?.(['a', 'b'], ['b', 'a'])).toBe(false)
  })
})

describe('bg_display parser', () => {
  it('reads brightness in percent, on the store scale', () => {
    expect(parseAsBgDisplay.parse('brightness:70')).toBe(0.7)
    expect(parseAsBgDisplay.parse('brightness:20')).toBe(BRIGHTNESS_MIN)
    expect(parseAsBgDisplay.parse('brightness:100')).toBe(BRIGHTNESS_MAX)
  })

  it('writes brightness as a whole percent', () => {
    expect(parseAsBgDisplay.serialize(0.7)).toBe('brightness:70')
    expect(parseAsBgDisplay.serialize(1)).toBe('brightness:100')
    expect(parseAsBgDisplay.serialize(0.504)).toBe('brightness:50')
  })

  it('round trips through the URL', () => {
    const back = parseAsBgDisplay.parse(
      throughUrl('bg_display', parseAsBgDisplay.serialize(0.45)) ?? '',
    )
    expect(back).toBe(0.45)
  })

  it('gives no opinion (null) without a brightness entry', () => {
    expect(parseAsBgDisplay.parse('')).toBeNull()
    expect(parseAsBgDisplay.parse('brightness')).toBeNull()
    expect(parseAsBgDisplay.parse('contrast:50')).toBeNull()
    expect(parseAsBgDisplay.parse('constructor:5')).toBeNull()
  })

  it('ignores an unknown name and reads the brightness beside it', () => {
    expect(parseAsBgDisplay.parse('contrast:50,brightness:70')).toBe(0.7)
    expect(parseAsBgDisplay.parse('brightness:70,sharpness:3')).toBe(0.7)
  })

  it('ignores a value that is not a whole percent in range', () => {
    expect(parseAsBgDisplay.parse('brightness:abc')).toBeNull()
    expect(parseAsBgDisplay.parse('brightness:70.5')).toBeNull()
    expect(parseAsBgDisplay.parse('brightness:-5')).toBeNull()
    expect(parseAsBgDisplay.parse('brightness:')).toBeNull()
    expect(parseAsBgDisplay.parse('brightness:10')).toBeNull()
    expect(parseAsBgDisplay.parse('brightness:101')).toBeNull()
    expect(parseAsBgDisplay.parse('brightness:70:1')).toBeNull()
  })

  it('takes the first brightness of a repeat, and trims the parts', () => {
    expect(parseAsBgDisplay.parse('brightness:70,brightness:30')).toBe(0.7)
    expect(parseAsBgDisplay.parse(' brightness : 40 ')).toBe(0.4)
  })

  it('compares whole percents', () => {
    expect(parseAsBgDisplay.eq?.(0.7, 0.7)).toBe(true)
    expect(parseAsBgDisplay.eq?.(0.7, 0.6)).toBe(false)
  })

  it('has the range of the brightness setting in its list', () => {
    expect(DISPLAY_RANGES.brightness).toEqual([BRIGHTNESS_MIN * 100, BRIGHTNESS_MAX * 100])
  })

  it('reads the names it knows as percents, and leaves out the rest', () => {
    expect(readDisplayList('brightness:70,contrast:9,brightness:10')).toEqual({ brightness: 70 })
    expect(readDisplayList('')).toEqual({})
  })
})

describe('the iD names of the parameters', () => {
  it('declare bg as background (read with layer) and overlays, through the registry', () => {
    const registry = createUrlParams([])
    const background = registry.declare(
      { name: 'bg', parser: parseAsBackground, iD: ID_BACKGROUND },
      'imagery',
    ).handle
    const overlays = registry.declare(
      { name: 'overlays', parser: parseAsOverlays, iD: ID_OVERLAYS },
      'imagery',
    ).handle
    expect(background.name).toBe('bg')
    expect(background.iD).toEqual({ name: 'background', aliases: ['layer'] })
    expect(overlays.iD?.toId?.(NONE)).toBe('')
    expect(overlays.iD?.toId?.('a,b')).toBe('a,b')
  })

  it('declares bg_display beside them, with no iD name', () => {
    const registry = createUrlParams([])
    registry.declare({ name: 'bg', parser: parseAsBackground, iD: ID_BACKGROUND }, 'imagery')
    const display = registry.declare(
      { name: 'bg_display', parser: parseAsBgDisplay, options: { history: 'replace' } },
      'imagery',
    ).handle
    expect(display.name).toBe('bg_display')
    expect(display.iD).toBeUndefined()
    expect(display.options.history).toBe('replace')
  })
})
