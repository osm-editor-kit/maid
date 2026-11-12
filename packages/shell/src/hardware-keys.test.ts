import { describe, expect, test } from 'bun:test'
import { isHardwareKey, type KeyPress } from './hardware-keys'

const press = (key: string, more: Partial<KeyPress> = {}): KeyPress => ({
  key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  typing: false,
  ...more,
})

describe('isHardwareKey', () => {
  test('outside a text field every key is a hardware key: the on-screen keyboard is closed', () => {
    expect(isHardwareKey(press('a'))).toBe(true)
    expect(isHardwareKey(press('Shift', { shiftKey: true }))).toBe(true)
  })

  test('a letter or Backspace in a field may be the on-screen keyboard', () => {
    expect(isHardwareKey(press('a', { typing: true }))).toBe(false)
    expect(isHardwareKey(press('A', { typing: true, shiftKey: true }))).toBe(false)
    expect(isHardwareKey(press('Backspace', { typing: true }))).toBe(false)
    expect(isHardwareKey(press('Enter', { typing: true }))).toBe(false)
  })

  test('a modifier, an arrow, Escape or Tab in a field is the hardware keyboard', () => {
    expect(isHardwareKey(press('Shift', { typing: true, shiftKey: true }))).toBe(true)
    expect(isHardwareKey(press('Alt', { typing: true, altKey: true }))).toBe(true)
    expect(isHardwareKey(press('z', { typing: true, metaKey: true }))).toBe(true)
    expect(isHardwareKey(press('ArrowLeft', { typing: true }))).toBe(true)
    expect(isHardwareKey(press('Escape', { typing: true }))).toBe(true)
    expect(isHardwareKey(press('Tab', { typing: true }))).toBe(true)
    expect(isHardwareKey(press('F5', { typing: true }))).toBe(true)
  })

  test('an Android keyboard that composes is not a hardware key, in a field or not', () => {
    expect(isHardwareKey(press('Unidentified'))).toBe(false)
    expect(isHardwareKey(press('Process', { typing: true }))).toBe(false)
    expect(isHardwareKey(press('a', { typing: true, isComposing: true }))).toBe(false)
  })
})
