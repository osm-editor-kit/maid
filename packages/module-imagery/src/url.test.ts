import { describe, expect, it } from 'bun:test'
import { createUrlParams } from '@osm-editor-kit/maid-core'
import {
  ID_BACKGROUND,
  ID_OVERLAYS,
  NONE,
  parseAsBackground,
  parseAsOverlays,
  customValue,
  templateOf,
  isOwnValue,
} from './url.ts'

/** The value the URL carries: nuqs encodes it, and URLSearchParams decodes it, so the round trip goes through both */
function throughUrl(value: string) {
  const search = new URLSearchParams()
  search.set('background', value)
  return new URLSearchParams(search.toString()).get('background')
}

describe('background parser', () => {
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
    const back = parseAsBackground.parse(throughUrl(parseAsBackground.serialize(value)) ?? '')
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
    const back = parseAsOverlays.parse(throughUrl(parseAsOverlays.serialize([])) ?? '')
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

describe('the iD names of the two parameters', () => {
  it('declare as background (read with layer) and overlays, through the registry', () => {
    const registry = createUrlParams([])
    const background = registry.declare(
      { name: 'background', parser: parseAsBackground, iD: ID_BACKGROUND },
      'imagery',
    ).handle
    const overlays = registry.declare(
      { name: 'overlays', parser: parseAsOverlays, iD: ID_OVERLAYS },
      'imagery',
    ).handle
    expect(background.iD).toEqual({ name: 'background', aliases: ['layer'] })
    expect(overlays.iD?.toId?.(NONE)).toBe('')
    expect(overlays.iD?.toId?.('a,b')).toBe('a,b')
  })
})
