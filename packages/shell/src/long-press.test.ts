import { describe, expect, test } from 'bun:test'
import { LONG_PRESS_MOVE_PX, LONG_PRESS_MS, LongPress } from './long-press'

/** A short delay keeps the tests quick; the real one is LONG_PRESS_MS */
const DELAY = 15
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('LongPress', () => {
  test('the shared constants are 500 ms and 8 px', () => {
    expect(LONG_PRESS_MS).toBe(500)
    expect(LONG_PRESS_MOVE_PX).toBe(8)
  })

  test('a press that ends before the time passes is not a long press', async () => {
    const press = new LongPress(DELAY, 8)
    let fired = 0
    press.start({ x: 10, y: 10 }, () => fired++)
    expect(press.state).toBe('pressing')
    expect(press.end()).toBe(false)
    await wait(DELAY * 3)
    expect(fired).toBe(0)
    expect(press.state).toBe('idle')
  })

  test('still for the time: active, and onActive runs once with the place', async () => {
    const press = new LongPress(DELAY, 8)
    const places: { x: number; y: number }[] = []
    press.start({ x: 10, y: 20 }, (at) => places.push(at))
    await wait(DELAY * 3)
    expect(press.state).toBe('active')
    expect(places).toEqual([{ x: 10, y: 20 }])
    expect(press.end()).toBe(true)
    expect(press.state).toBe('idle')
    await wait(DELAY * 2)
    expect(places.length).toBe(1)
  })

  test('a move beyond the tolerance before the time passes cancels the press', async () => {
    const press = new LongPress(DELAY, 8)
    let fired = 0
    press.start({ x: 0, y: 0 }, () => fired++)
    press.move({ x: 9, y: 0 })
    expect(press.state).toBe('idle')
    await wait(DELAY * 3)
    expect(fired).toBe(0)
    expect(press.end()).toBe(false)
  })

  test('a move within the tolerance keeps the press, and its place follows the finger', async () => {
    const press = new LongPress(DELAY, 8)
    const places: { x: number; y: number }[] = []
    press.start({ x: 0, y: 0 }, (at) => places.push(at))
    // 5 px in each direction is 7.07 px: inside the 8 px tolerance
    press.move({ x: 5, y: 5 })
    expect(press.state).toBe('pressing')
    await wait(DELAY * 3)
    expect(places).toEqual([{ x: 5, y: 5 }])
  })

  test('the tolerance is a distance, not a square: 8 px along a diagonal is still inside', () => {
    const press = new LongPress(DELAY, 8)
    press.start({ x: 0, y: 0 }, () => undefined)
    // 6 px on each axis is 8.49 px: beyond the tolerance
    press.move({ x: 6, y: 6 })
    expect(press.state).toBe('idle')
  })

  test('an active press goes on moving: it is not cancelled by a move', async () => {
    const press = new LongPress(DELAY, 8)
    press.start({ x: 0, y: 0 }, () => undefined)
    await wait(DELAY * 3)
    press.move({ x: 100, y: 100 })
    expect(press.state).toBe('active')
    expect(press.at).toEqual({ x: 100, y: 100 })
    expect(press.end()).toBe(true)
  })

  test('a new press replaces the one before: only the latest fires', async () => {
    const press = new LongPress(DELAY, 8)
    const fired: string[] = []
    press.start({ x: 0, y: 0 }, () => fired.push('first'))
    press.start({ x: 50, y: 50 }, () => fired.push('second'))
    await wait(DELAY * 3)
    expect(fired).toEqual(['second'])
  })

  test('cancel leaves no timer to fire', async () => {
    const press = new LongPress(DELAY, 8)
    let fired = 0
    press.start({ x: 0, y: 0 }, () => fired++)
    press.cancel()
    await wait(DELAY * 3)
    expect(fired).toBe(0)
    expect(press.state).toBe('idle')
  })

  test('a move while idle does nothing', () => {
    const press = new LongPress(DELAY, 8)
    press.move({ x: 3, y: 3 })
    expect(press.state).toBe('idle')
    expect(press.at).toBeUndefined()
  })
})
