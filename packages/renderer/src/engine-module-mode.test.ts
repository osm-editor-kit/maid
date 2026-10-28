import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createEditor, lazyPresets } from '@osm-editor-kit/maid-core'
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
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

/** A key event the engine's listener can read (bun has no KeyboardEvent). Cancelable, so a preventDefault shows in dispatchEvent. */
function keyEvent(
  key: string,
  modifiers: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
) {
  return Object.assign(new Event('keydown', { cancelable: true }), {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
  })
}

function escapeEvent() {
  return keyEvent('Escape')
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

    engine.moduleModeClick({ x: 1, y: 2 }, 13.0005, 52.0035)

    expect(clicks).toEqual([[13.0005, 52.0035]])
    expect(engine.selection).toEqual(['w10'])
  })

  test('a click that the mode does not take (no onClick) selects nothing', () => {
    const { engine } = engineWithData()
    engine.enterModuleMode({ id: 'test' })
    engine.moduleModeClick({ x: 1, y: 2 }, 13.0, 52.003)
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

  test('undo ends the module mode first: the mode may hold ids that the step takes back', () => {
    const { engine } = engineWithData()
    engine.setTag('w10', 'highway', 'service')
    const exits: string[] = []
    engine.enterModuleMode({ id: 'test', onExit: () => exits.push('exit') })

    engine.undo()

    expect(engine.moduleMode).toBeUndefined()
    expect(exits).toEqual(['exit'])
    expect(engine.data.way('w10')?.tags.highway).toBe('residential')
  })

  test('undo and redo end a mode that keeps its work outside the history, and step through nothing', () => {
    const { engine } = engineWithData()
    engine.setTag('w10', 'highway', 'service')
    const exits: string[] = []
    engine.enterModuleMode({ id: 'test', endsOnUndo: true, onExit: () => exits.push('undo') })
    engine.undo()
    expect(engine.moduleMode).toBeUndefined()
    expect(engine.data.way('w10')?.tags.highway).toBe('service')
    engine.undo()
    expect(engine.data.way('w10')?.tags.highway).toBe('residential')
    engine.enterModuleMode({ id: 'test', endsOnUndo: true, onExit: () => exits.push('redo') })
    engine.redo()
    expect(engine.data.way('w10')?.tags.highway).toBe('residential')
    expect(exits).toEqual(['undo', 'redo'])
  })

  test('undo ends such a mode also when there is nothing to undo', () => {
    const { engine } = engineWithData()
    engine.enterModuleMode({ id: 'test', endsOnUndo: true })
    engine.undo()
    expect(engine.moduleMode).toBeUndefined()
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

describe('the keys and the snap a module mode gets', () => {
  let target: EventTarget | undefined

  beforeEach(() => {
    target = fakeWindow()
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  test('Enter goes to the mode and is swallowed when the mode takes it; the mode stays on', () => {
    const { engine } = engineWithData()
    const keys: string[] = []
    engine.enterModuleMode({
      id: 'draw',
      onKey: (key) => {
        keys.push(key)
        return key === 'Enter'
      },
    })

    expect(target?.dispatchEvent(keyEvent('Enter'))).toBe(false)
    expect(target?.dispatchEvent(keyEvent('Backspace'))).toBe(true)
    expect(keys).toEqual(['Enter', 'Backspace'])
    expect(engine.moduleMode?.id).toBe('draw')
  })

  test('a key with a modifier does not reach the mode', () => {
    const { engine } = engineWithData()
    const keys: string[] = []
    engine.enterModuleMode({
      id: 'draw',
      onKey: (key) => {
        keys.push(key)
        return true
      },
    })
    expect(target?.dispatchEvent(keyEvent('Backspace', { metaKey: true }))).toBe(true)
    expect(keys).toEqual([])
  })

  test('a click goes to the mode with its pixel and the modifier keys; no map means no snap target', () => {
    const { engine } = engineWithData()
    const infos: unknown[] = []
    engine.enterModuleMode({
      id: 'draw',
      snap: true,
      onClick: (_lon, _lat, info) => infos.push(info),
    })
    engine.moduleModeClick({ x: 3, y: 4 }, 13.0005, 52.0035)
    expect(infos).toEqual([
      { point: { x: 3, y: 4 }, modifiers: { shift: false, alt: false, ctrl: false, meta: false } },
    ])
  })

  test('runOperation of an operation that asks for input starts it, runs nothing and keeps the selection', () => {
    const { engine } = engineWithData()
    engine.setSelected('w10')
    const graph = engine.data.history.staging.graph
    const started: OperationContext[] = []
    const hosts: boolean[] = []
    const operation: Operation = {
      id: 'ask',
      label: 'Ask',
      applies: () => true,
      disabled: () => undefined,
      run: () => {
        throw new Error('run is not called for an operation with start')
      },
      start: (context, host) => {
        started.push(context)
        hosts.push(host.engine === engine)
      },
    }

    const next = engine.runOperation(operation)

    expect(started.map((context) => context.selected)).toEqual([['w10']])
    // the operation gets the engine it runs on, so a module needs no reference of its own
    expect(hosts).toEqual([true])
    expect(next).toEqual(['w10'])
    expect(engine.selection).toEqual(['w10'])
    expect(engine.data.history.staging.graph).toBe(graph)
  })

  test('runOperation without start runs the operation as before', () => {
    const { engine } = engineWithData()
    engine.setSelected('w10')
    let ran = 0
    const operation: Operation = {
      id: 'plain',
      label: 'Plain',
      applies: () => true,
      disabled: () => undefined,
      run: () => {
        ran++
        return { actions: [], annotation: 'Did nothing' }
      },
    }
    expect(engine.runOperation(operation)).toEqual(['w10'])
    expect(ran).toBe(1)
  })
})
