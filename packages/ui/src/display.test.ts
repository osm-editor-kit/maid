import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { chooseDisplay } from './display.ts'
import { getSettings } from './settings.ts'

// The choice is remembered in the settings store, which reads localStorage (as settings.test.ts sets it up).
const entries = new Map<string, string>()
const fake = {
  getItem: (name: string) => entries.get(name) ?? null,
  setItem: (name: string, value: string) => void entries.set(name, value),
  removeItem: (name: string) => void entries.delete(name),
}
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true })
})

afterAll(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

/** An engine that only remembers the display it was given */
function engineSaying() {
  const shown: string[] = []
  const engine = { setDisplay: (display: string) => shown.push(display) } as unknown as MaidEngine
  return { engine, shown }
}

describe('chooseDisplay: a choice of the person shows and is remembered', () => {
  test('wireframe and changes are shown and stored in the URL notation', () => {
    const { engine, shown } = engineSaying()
    chooseDisplay(engine, 'wireframe')
    expect(shown).toEqual(['wireframe'])
    expect(getSettings().shown.display).toBe('wireframe')
    chooseDisplay(engine, 'edits')
    expect(shown).toEqual(['wireframe', 'edits'])
    expect(getSettings().shown.display).toBe('edits')
  })

  test("the normal look is stored as nothing, the filters' notation for the default", () => {
    const { engine, shown } = engineSaying()
    chooseDisplay(engine, 'normal')
    expect(shown).toEqual(['normal'])
    expect(getSettings().shown.display).toBe('')
  })
})
