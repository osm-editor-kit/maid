import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createEditor, lazyPresets } from '@osm-editor-kit/maid-core'
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { MaidEngine } from './engine'
import type { ModuleMode } from './module-mode'

// two plain points: selectable, and a way between them
const elements: OsmJsonElement[] = [
  { type: 'node', id: 4, lat: 52.003, lon: 13.0, tags: {} },
  { type: 'node', id: 5, lat: 52.004, lon: 13.001, tags: {} },
  { type: 'way', id: 10, nodes: [4, 5], tags: { highway: 'residential' } },
]

function engineWithData() {
  const editor = createEditor({ presets: lazyPresets(() => defaultPresets) })
  const engine = new MaidEngine({
    editor,
    apiUrl: 'http://localhost:8090/s/small',
    minDataZoom: 16,
  })
  engine.merge(elements)
  return { editor, engine }
}

/** A stand-in for the browser's window: the engine only adds and removes its Escape listener on it */
function fakeWindow() {
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true, writable: true })
  return target
}

/** A key event the engine's listener can read (bun has no KeyboardEvent) */
function escapeEvent() {
  const event = new Event('keydown') as Event & { key: string }
  event.key = 'Escape'
  return event
}

describe('the engine sends the pointer to a module mode', () => {
  let target: EventTarget | undefined

  beforeEach(() => {
    target = fakeWindow()
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  test('a click goes to the mode and the selection stays as it was', () => {
    const { engine } = engineWithData()
    engine.setSelected('w10')
    const clicks: Array<[number, number]> = []
    engine.enterModuleMode({ id: 'test', onClick: (lon, lat) => clicks.push([lon, lat]) })

    engine.moduleModeClick(13.0005, 52.0035)

    expect(clicks).toEqual([[13.0005, 52.0035]])
    expect(engine.selection).toEqual(['w10'])
  })

  test('a click that the mode does not take (no onClick) selects nothing', () => {
    const { engine } = engineWithData()
    engine.enterModuleMode({ id: 'test' })
    engine.moduleModeClick(13.0, 52.003)
    expect(engine.selection).toEqual([])
  })

  test('enterModuleMode exposes the mode, exitModuleMode ends it and runs onExit', () => {
    const { engine } = engineWithData()
    const exits: string[] = []
    const mode: ModuleMode = { id: 'test', onExit: () => exits.push('exit') }

    engine.enterModuleMode(mode)
    expect(engine.moduleMode).toBe(mode)

    engine.exitModuleMode('other')
    expect(engine.moduleMode).toBe(mode)

    engine.exitModuleMode('test')
    expect(engine.moduleMode).toBeUndefined()
    expect(exits).toEqual(['exit'])

    engine.exitModuleMode()
    expect(exits).toEqual(['exit'])
  })

  test('Escape ends the mode and is taken from the editor (the selection stays)', () => {
    const { engine } = engineWithData()
    engine.setSelected('w10')
    engine.enterModuleMode({ id: 'test' })

    target?.dispatchEvent(escapeEvent())

    expect(engine.moduleMode).toBeUndefined()
    expect(engine.selection).toEqual(['w10'])
  })

  test('Escape without a mode does nothing, and the listener is gone after the mode ends', () => {
    const { engine } = engineWithData()
    engine.enterModuleMode({ id: 'test' })
    engine.exitModuleMode()
    expect(() => target?.dispatchEvent(escapeEvent())).not.toThrow()
    expect(engine.moduleMode).toBeUndefined()
  })

  test('a mode change ends the module mode first', () => {
    const { engine } = engineWithData()
    const exits: string[] = []
    engine.enterModuleMode({ id: 'test', onExit: () => exits.push('exit') })

    engine.setMode('browse')

    expect(engine.moduleMode).toBeUndefined()
    expect(exits).toEqual(['exit'])
  })

  test('a second mode replaces the first, which exits', () => {
    const { engine } = engineWithData()
    const exits: string[] = []
    engine.enterModuleMode({ id: 'first', onExit: () => exits.push('first') })
    engine.enterModuleMode({ id: 'second' })
    expect(engine.moduleMode?.id).toBe('second')
    expect(exits).toEqual(['first'])
  })

  test('destroy removes the Escape listener', () => {
    const { engine } = engineWithData()
    engine.enterModuleMode({ id: 'test' })
    engine.destroy()
    // the listener is gone: an Escape after destroy leaves the mode alone
    target?.dispatchEvent(escapeEvent())
    expect(engine.moduleMode?.id).toBe('test')
  })
})
