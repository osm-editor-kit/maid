import { afterEach, describe, expect, it } from 'bun:test'
import { isAutomated } from './automated.ts'
import { moduleStorage } from './storage.ts'

const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

/** Replaces a global for one test; `restore` puts the real one back */
function stubGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

function restore(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else delete (globalThis as Record<string, unknown>)[name]
}

/** An in-memory localStorage that records what was written */
function fakeLocalStorage(): Map<string, string> {
  const items = new Map<string, string>()
  stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  })
  return items
}

afterEach(() => {
  restore('navigator', original)
  restore('localStorage', originalStorage)
})

describe('isAutomated', () => {
  it('is true only when navigator.webdriver is true', () => {
    stubGlobal('navigator', { webdriver: true })
    expect(isAutomated()).toBe(true)
    stubGlobal('navigator', { webdriver: false })
    expect(isAutomated()).toBe(false)
    stubGlobal('navigator', {})
    expect(isAutomated()).toBe(false)
  })

  it('is false where there is no navigator', () => {
    stubGlobal('navigator', undefined)
    expect(isAutomated()).toBe(false)
  })
})

describe('moduleStorage', () => {
  it('keeps nothing under automation and writes nothing to localStorage', () => {
    const items = fakeLocalStorage()
    stubGlobal('navigator', { webdriver: true })
    const storage = moduleStorage()
    storage.setItem('maid:test', '{"a":1}')
    expect(storage.getItem('maid:test')).toBeNull()
    expect(items.size).toBe(0)
  })

  it('reads and writes localStorage under the same key for a person', () => {
    const items = fakeLocalStorage()
    stubGlobal('navigator', {})
    const storage = moduleStorage()
    storage.setItem('maid:test', '{"a":1}')
    expect(items.get('maid:test')).toBe('{"a":1}')
    expect(storage.getItem('maid:test')).toBe('{"a":1}')
    storage.removeItem('maid:test')
    expect(items.has('maid:test')).toBe(false)
  })

  it('does not throw where localStorage is blocked or missing', () => {
    stubGlobal('navigator', {})
    stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    const storage = moduleStorage()
    expect(storage.getItem('maid:test')).toBeNull()
    expect(() => storage.setItem('maid:test', '{}')).not.toThrow()
    expect(() => storage.removeItem('maid:test')).not.toThrow()
    restore('localStorage', undefined)
    expect(moduleStorage().getItem('maid:test')).toBeNull()
  })
})
