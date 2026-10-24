import { describe, expect, it } from 'bun:test'
import { formatModifiers, formatShortcut } from './shortcut-label.ts'

describe('formatShortcut: Apple devices', () => {
  it('writes the command key as ⌘ and the modifiers in Apple order', () => {
    expect(formatShortcut('Mod+F', true)).toBe('⌘F')
    expect(formatShortcut('Mod+Shift+Z', true)).toBe('⇧⌘Z')
    expect(formatShortcut('Ctrl+Alt+Shift+Mod+K', true)).toBe('⌃⌥⇧⌘K')
  })

  it('writes Alt as ⌥ and Ctrl as ⌃', () => {
    expect(formatShortcut('Alt+1', true)).toBe('⌥1')
    expect(formatShortcut('Ctrl+Z', true)).toBe('⌃Z')
  })

  it('reads the symbols and words of other labels the same way', () => {
    expect(formatShortcut('⇧⌘Z', true)).toBe('⇧⌘Z')
    expect(formatShortcut('⌘⌫', true)).toBe('⌘⌫')
    expect(formatShortcut('Command+Option+1', true)).toBe('⌥⌘1')
  })
})

describe('formatShortcut: other platforms', () => {
  it('writes Mod as Ctrl and joins the words with plus signs', () => {
    expect(formatShortcut('Mod+F', false)).toBe('Ctrl+F')
    expect(formatShortcut('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z')
  })

  it('writes Alt and Shift as words, in the order Ctrl, Alt, Shift', () => {
    expect(formatShortcut('Alt+1', false)).toBe('Alt+1')
    expect(formatShortcut('Shift+Alt+Ctrl+Z', false)).toBe('Ctrl+Alt+Shift+Z')
  })

  it('reads the symbols of an Apple label: ⌘⌫ is Ctrl+⌫ elsewhere', () => {
    expect(formatShortcut('⌘⌫', false)).toBe('Ctrl+⌫')
    expect(formatShortcut('⇧⌘Z', false)).toBe('Ctrl+Shift+Z')
    expect(formatShortcut('⌥1', false)).toBe('Alt+1')
  })
})

describe('formatShortcut: keys without a modifier', () => {
  it('keeps the key as it is on both platforms', () => {
    expect(formatShortcut('1', true)).toBe('1')
    expect(formatShortcut('1', false)).toBe('1')
    expect(formatShortcut('ArrowLeft', false)).toBe('ArrowLeft')
    expect(formatShortcut('Shift+ArrowLeft', true)).toBe('⇧ArrowLeft')
  })

  it('keeps a word that is the whole shortcut', () => {
    expect(formatShortcut('Shift', false)).toBe('Shift')
  })
})

describe('formatShortcut: the labels the editor writes', () => {
  it('shows the shell modKey output unchanged on its own platform', () => {
    // platform.ts: ⌘Z and ⇧⌘Z on Apple, Ctrl+Z and Ctrl+Shift+Z elsewhere
    expect(formatShortcut('⌘Z', true)).toBe('⌘Z')
    expect(formatShortcut('⇧⌘Z', true)).toBe('⇧⌘Z')
    expect(formatShortcut('Ctrl+Z', false)).toBe('Ctrl+Z')
    expect(formatShortcut('Ctrl+Shift+Z', false)).toBe('Ctrl+Shift+Z')
  })
})

describe('formatModifiers: modifier keys alone, for a hint', () => {
  it('writes every part as a modifier, in the platform order', () => {
    expect(formatModifiers('Shift', true)).toBe('⇧')
    expect(formatModifiers('Shift', false)).toBe('Shift')
    expect(formatModifiers('Shift+Alt', true)).toBe('⌥⇧')
    expect(formatModifiers('Shift+Alt', false)).toBe('Alt+Shift')
    expect(formatModifiers('Mod+Shift', false)).toBe('Ctrl+Shift')
  })
})
