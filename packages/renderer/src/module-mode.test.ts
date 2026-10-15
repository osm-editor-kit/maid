import { describe, expect, test } from 'bun:test'
import {
  CLICK_AFTER_DRAG_MS,
  ModuleModeSession,
  type ModuleMode,
  type ScreenPoint,
} from './module-mode'

/** A session with a clock the test moves, and handles at the pixels the test names */
function sessionWith(handles: Record<string, string> = {}) {
  let time = 1000
  const log: string[] = []
  let changes = 0
  const session = new ModuleModeSession({
    handleAt: (point: ScreenPoint) => handles[`${point.x},${point.y}`],
    now: () => time,
    changed: () => changes++,
  })
  return {
    session,
    log,
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
    session.click(13.4, 52.5)
    session.move(13.4, 52.5)
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
    session.click(13.4, 52.5)
    session.move(13.5, 52.6)
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
      session.move(13, 52)
      session.release(13, 52)
      session.click(13, 52)
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
    session.move(13.41, 52.51)
    session.move(13.42, 52.52)
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
    session.move(13.41, 52.51)
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
    session.move(13.41, 52.5)
    session.release(13.41, 52.5)
    advance(CLICK_AFTER_DRAG_MS - 1)
    session.click(13.41, 52.5)
    expect(log.some((line) => line.startsWith('click'))).toBe(false)
    advance(2)
    session.click(13.5, 52.5)
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
