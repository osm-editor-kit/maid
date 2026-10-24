import { describe, expect, test } from 'bun:test'
import { NO_MODIFIERS, type Modifiers } from './modifiers'
import {
  CLICK_AFTER_DRAG_MS,
  moduleKeyOf,
  ModuleModeSession,
  type ModuleMode,
  type ScreenPoint,
} from './module-mode'
import type { SnapTarget } from './snap'

/** The pixel the pointer is over in the tests that do not care where it is */
const at: ScreenPoint = { x: 1, y: 1 }

/**
 * A session with a clock the test moves, handles at the pixels the test names, and a snap that returns `target` and
 * records the features it was asked to skip
 */
function sessionWith(
  handles: Record<string, string> = {},
  options: { target?: SnapTarget; modifiers?: Modifiers } = {},
) {
  let time = 1000
  const log: string[] = []
  let changes = 0
  const snaps: { point: ScreenPoint; skip: ReadonlySet<string> }[] = []
  const session = new ModuleModeSession({
    handleAt: (point: ScreenPoint) => handles[`${point.x},${point.y}`],
    now: () => time,
    changed: () => changes++,
    snapAt: (point, skip) => {
      snaps.push({ point, skip })
      return options.target
    },
    modifiers: () => options.modifiers ?? NO_MODIFIERS,
  })
  return {
    session,
    log,
    snaps,
    changes: () => changes,
    advance: (ms: number) => (time += ms),
  }
}

/** A mode that writes each callback to the log */
function modeLogging(id: string, log: string[], extra: Partial<ModuleMode> = {}): ModuleMode {
  return {
    id,
    handleLayers: ['handles'],
    onClick: (lon, lat) => log.push(`click ${lon},${lat}`),
    onMove: (lon, lat) => log.push(`move ${lon},${lat}`),
    onDragStart: (handle, lon, lat) => log.push(`start ${handle} ${lon},${lat}`),
    onDrag: (handle, lon, lat) => log.push(`drag ${handle} ${lon},${lat}`),
    onDragEnd: (handle, lon, lat) => log.push(`end ${handle} ${lon},${lat}`),
    onExit: () => log.push('exit'),
    ...extra,
  }
}

describe('a module mode takes the pointer', () => {
  test('nothing is active until a mode is entered, and clicks go nowhere', () => {
    const { session, log } = sessionWith()
    expect(session.mode).toBeUndefined()
    session.click(at, 13.4, 52.5)
    session.move(at, 13.4, 52.5)
    expect(log).toEqual([])
  })

  test('enter sets the mode and tells the engine; exit ends it and runs onExit once', () => {
    const { session, log, changes } = sessionWith()
    session.enter(modeLogging('reroute', log))
    expect(session.mode?.id).toBe('reroute')
    expect(changes()).toBe(1)

    expect(session.exit()).toBe(true)
    expect(session.mode).toBeUndefined()
    expect(log).toEqual(['exit'])
    expect(changes()).toBe(2)

    expect(session.exit()).toBe(false)
    expect(log).toEqual(['exit'])
  })

  test('exit with an id ends only that mode', () => {
    const { session, log } = sessionWith()
    session.enter(modeLogging('reroute', log))
    expect(session.exit('other')).toBe(false)
    expect(session.mode?.id).toBe('reroute')
    expect(session.exit('reroute')).toBe(true)
    expect(log).toEqual(['exit'])
  })

  test('a click and a move go to the mode with the longitude and latitude', () => {
    const { session, log } = sessionWith()
    session.enter(modeLogging('reroute', log))
    session.click(at, 13.4, 52.5)
    session.move(at, 13.5, 52.6)
    expect(log).toEqual(['click 13.4,52.5', 'move 13.5,52.6'])
  })

  test('entering a second mode ends the first one first', () => {
    const { session, log } = sessionWith()
    session.enter(modeLogging('first', log))
    session.enter(modeLogging('second', log, { onExit: () => log.push('second exit') }))
    expect(log).toEqual(['exit'])
    expect(session.mode?.id).toBe('second')
  })

  test('onExit may end the mode again without harm', () => {
    const { session, log } = sessionWith()
    let calls = 0
    session.enter(
      modeLogging('reroute', log, {
        onExit: () => {
          calls++
          session.exit()
        },
      }),
    )
    session.exit()
    expect(calls).toBe(1)
    expect(session.mode).toBeUndefined()
  })

  test('a mode without the optional callbacks ignores the pointer', () => {
    const { session } = sessionWith()
    session.enter({ id: 'quiet' })
    expect(() => {
      session.press({ x: 1, y: 1 }, 13, 52)
      session.move(at, 13, 52)
      session.release(13, 52)
      session.click(at, 13, 52)
    }).not.toThrow()
    expect(session.dragged).toBe(false)
  })
})

describe('handles of a module mode are dragged', () => {
  test('a press on a handle starts a drag; the moves follow it; the release ends it', () => {
    const { session, log } = sessionWith({ '10,10': 'start' })
    session.enter(modeLogging('reroute', log))
    session.press({ x: 10, y: 10 }, 13.4, 52.5)
    expect(session.dragged).toBe(true)
    session.move(at, 13.41, 52.51)
    session.move(at, 13.42, 52.52)
    session.release(13.42, 52.52)
    expect(session.dragged).toBe(false)
    expect(log).toEqual([
      'start start 13.4,52.5',
      'drag start 13.41,52.51',
      'drag start 13.42,52.52',
      'end start 13.42,52.52',
    ])
  })

  test('a press off the handles changes nothing and a move is a plain move', () => {
    const { session, log } = sessionWith({ '10,10': 'start' })
    session.enter(modeLogging('reroute', log))
    session.press({ x: 50, y: 50 }, 13.4, 52.5)
    expect(session.dragged).toBe(false)
    session.move(at, 13.41, 52.51)
    expect(log).toEqual(['move 13.41,52.51'])
  })

  test('a mode without handle layers starts no drag', () => {
    const { session, log } = sessionWith({ '10,10': 'start' })
    session.enter(modeLogging('reroute', log, { handleLayers: undefined }))
    session.press({ x: 10, y: 10 }, 13.4, 52.5)
    expect(session.dragged).toBe(false)
  })

  test('a click right after a drag is not a click', () => {
    const { session, log, advance } = sessionWith({ '10,10': 'end' })
    session.enter(modeLogging('reroute', log))
    session.press({ x: 10, y: 10 }, 13.4, 52.5)
    session.move(at, 13.41, 52.5)
    session.release(13.41, 52.5)
    advance(CLICK_AFTER_DRAG_MS - 1)
    session.click(at, 13.41, 52.5)
    expect(log.some((line) => line.startsWith('click'))).toBe(false)
    advance(2)
    session.click(at, 13.5, 52.5)
    expect(log.at(-1)).toBe('click 13.5,52.5')
  })

  test('exit during a drag drops the drag', () => {
    const { session, log } = sessionWith({ '10,10': 'start' })
    session.enter(modeLogging('reroute', log))
    session.press({ x: 10, y: 10 }, 13.4, 52.5)
    session.exit()
    expect(session.dragged).toBe(false)
    expect(log.at(-1)).toBe('exit')
  })
})

describe('a mode is told the pixel, the modifier keys and a snap (ADR 0011, hook 4)', () => {
  test('onMove and onClick get the pixel and the modifier keys; a mode that does not snap gets no target', () => {
    const { session, snaps } = sessionWith({}, { modifiers: { ...NO_MODIFIERS, shift: true } })
    const infos: unknown[] = []
    session.enter({
      id: 'plain',
      onMove: (_lon, _lat, info) => infos.push(info),
      onClick: (_lon, _lat, info) => infos.push(info),
    })
    session.move({ x: 5, y: 6 }, 13.4, 52.5)
    session.click({ x: 5, y: 6 }, 13.4, 52.5)
    expect(infos).toEqual([
      { point: { x: 5, y: 6 }, modifiers: { ...NO_MODIFIERS, shift: true } },
      { point: { x: 5, y: 6 }, modifiers: { ...NO_MODIFIERS, shift: true } },
    ])
    expect(snaps).toEqual([])
  })

  test('a handle drag is told the modifier keys at its start, on each move and at its end', () => {
    const modifiers: Modifiers = { ...NO_MODIFIERS }
    const session = new ModuleModeSession({
      handleAt: () => 'ne',
      now: () => 1000,
      changed: () => {},
      snapAt: () => undefined,
      modifiers: () => modifiers,
    })
    const seen: string[] = []
    const keys = (info: { modifiers: Modifiers }) =>
      `${info.modifiers.shift ? 'shift' : ''}${info.modifiers.alt ? 'alt' : ''}` || '-'
    session.enter({
      id: 'resize',
      handleLayers: ['handles'],
      onDragStart: (handle, _lon, _lat, info) => seen.push(`start ${handle} ${keys(info)}`),
      onDrag: (handle, _lon, _lat, info) => seen.push(`drag ${handle} ${keys(info)}`),
      onDragEnd: (handle, _lon, _lat, info) => seen.push(`end ${handle} ${keys(info)}`),
    })
    session.press(at, 13.4, 52.5)
    modifiers.shift = true
    session.move(at, 13.41, 52.5)
    modifiers.alt = true
    session.move(at, 13.41, 52.5)
    modifiers.shift = false
    session.release(13.41, 52.5)
    expect(seen).toEqual(['start ne -', 'drag ne shift', 'drag ne shiftalt', 'end ne alt'])
  })

  test('a snapping mode gets the target under the pixel, and the features it skips are left out', () => {
    const target: SnapTarget = { type: 'node', id: 'n5', loc: [13.4, 52.5] }
    const { session, snaps } = sessionWith({}, { target })
    const seen: Array<SnapTarget | undefined> = []
    session.enter({
      id: 'draw',
      snap: true,
      skip: () => new Set(['w9']),
      onClick: (_lon, _lat, info) => seen.push(info.target),
    })
    session.click(at, 13.4, 52.5)
    expect(seen).toEqual([target])
    expect(snaps.length).toBe(1)
    expect(snaps[0]?.point).toEqual(at)
    expect([...(snaps[0]?.skip ?? [])]).toEqual(['w9'])
  })

  test('a snapping mode asks for a target only in a callback it has, and not for a drag', () => {
    const { session, snaps, log } = sessionWith(
      { '10,10': 'start' },
      {
        target: { type: 'node', id: 'n5', loc: [13.4, 52.5] },
      },
    )
    session.enter({
      ...modeLogging('draw', log),
      snap: true,
      onMove: undefined,
      onClick: undefined,
    })
    session.move(at, 13.4, 52.5)
    expect(snaps).toEqual([])
    session.enter({
      id: 'handles',
      snap: true,
      handleLayers: ['handles'],
      onDrag: () => log.push('drag'),
    })
    session.press({ x: 10, y: 10 }, 13.4, 52.5)
    session.move(at, 13.41, 52.5)
    expect(log.at(-1)).toBe('drag')
    expect(snaps).toEqual([])
  })

  test('key: the mode takes Enter and Backspace when its onKey says so; without one the key is not taken', () => {
    const { session } = sessionWith()
    const keys: string[] = []
    expect(session.key('Enter')).toBe(false)
    session.enter({
      id: 'draw',
      onKey: (key) => {
        keys.push(key)
        return key === 'Enter'
      },
    })
    expect(session.key('Enter')).toBe(true)
    expect(session.key('Backspace')).toBe(false)
    expect(keys).toEqual(['Enter', 'Backspace'])
    session.enter({ id: 'quiet' })
    expect(session.key('Enter')).toBe(false)
  })
})

describe('the keys a mode may take', () => {
  /** A key press as the window's listener reads it; `target` is the element it was typed in */
  function press(
    key: string,
    extra: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean; target: unknown }> = {},
  ) {
    return { key, ctrlKey: false, altKey: false, metaKey: false, target: undefined, ...extra }
  }

  test('Enter and Backspace without a modifier, from the map', () => {
    expect(moduleKeyOf(press('Enter'))).toBe('Enter')
    expect(moduleKeyOf(press('Backspace', { target: { tagName: 'DIV' } }))).toBe('Backspace')
    expect(moduleKeyOf(press('Backspace', { target: {} }))).toBe('Backspace')
  })

  test("other keys are not the mode's", () => {
    expect(moduleKeyOf(press('Escape'))).toBeUndefined()
    expect(moduleKeyOf(press('a'))).toBeUndefined()
  })

  test("a key with Control, Alt or Meta is the editor's (Mod+Backspace deletes)", () => {
    expect(moduleKeyOf(press('Backspace', { metaKey: true }))).toBeUndefined()
    expect(moduleKeyOf(press('Backspace', { ctrlKey: true }))).toBeUndefined()
    expect(moduleKeyOf(press('Enter', { altKey: true }))).toBeUndefined()
  })

  test("a key typed in a text field is the field's", () => {
    expect(moduleKeyOf(press('Backspace', { target: { tagName: 'INPUT' } }))).toBeUndefined()
    expect(moduleKeyOf(press('Enter', { target: { tagName: 'TEXTAREA' } }))).toBeUndefined()
    expect(
      moduleKeyOf(press('Backspace', { target: { tagName: 'DIV', isContentEditable: true } })),
    ).toBeUndefined()
  })
})
