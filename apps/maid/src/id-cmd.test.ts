// Adopted from iD test/spec/ui/cmd.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD translates a shortcut written with symbols (⌘⌫, ⇧A) into the platform's labels at run time.
// Maid's modKey(key) takes a key name and returns the label for the platform it runs on. The
// platform is read once, when platform.ts is first imported, so the Mac case loads the module under
// a URL of its own, after the navigator has been replaced.
import { afterAll, describe, expect, it } from 'bun:test'
import type * as Platform from './platform.ts'

const PLATFORM = './platform.ts'
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

/** platform.ts with the given navigator platform, loaded as a module of its own. */
async function loadPlatform(query: string, platform: string): Promise<typeof Platform> {
  Object.defineProperty(globalThis, 'navigator', { value: { platform }, configurable: true })
  const specifier: string = `${PLATFORM}?${query}`
  return (await import(specifier)) as typeof Platform
}

describe('iD.uiCmd', () => {
  afterAll(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  })

  it('does not overwrite mac keybindings', async () => {
    const mac = await loadPlatform('mac=1', 'MacIntel')
    expect(mac.MAC).toBe(true)
    expect(mac.modKey('A')).toBe('⌘A')
  })

  it.todo('changes keys to linux versions', () => {}) // needs F-ui-13 (⇧A alone)

  it.todo('changes keys to win versions', () => {}) // needs F-ui-14 (redo label)

  it.todo('handles multi-character keys', () => {}) // needs F-ui-13 (f11 with no modifier)
})
