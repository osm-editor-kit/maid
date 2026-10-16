import { describe, expect, test } from 'bun:test'
import { modifiersOf, NO_MODIFIERS, sameModifiers } from './modifiers'

describe('modifiers', () => {
  test('the keys of an event, as the browser gives them', () => {
    expect(modifiersOf({ shiftKey: true, altKey: false, ctrlKey: true, metaKey: false })).toEqual({
      shift: true,
      alt: false,
      ctrl: true,
      meta: false,
    })
  })

  test('two states are the same only if every key is the same', () => {
    expect(sameModifiers(NO_MODIFIERS, { ...NO_MODIFIERS })).toBe(true)
    expect(sameModifiers(NO_MODIFIERS, { ...NO_MODIFIERS, meta: true })).toBe(false)
  })
})
