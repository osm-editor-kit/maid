import { describe, expect, it } from 'bun:test'
import {
  CLOSE_GRACE_MS,
  INITIAL_TIP,
  OPEN_DELAY_MS,
  reduceTip,
  tipDelay,
  type TipContent,
  type TipEvent,
  type TipState,
} from './tooltip-group.ts'

const content = (label: string): TipContent => ({ label, placement: 'bottom' })
const enter = (id: string): TipEvent => ({ type: 'enter', id, content: content(id) })
const focus = (id: string): TipEvent => ({ type: 'focus', id, content: content(id) })
const leave = (id: string): TipEvent => ({ type: 'leave', id })
const press = (id: string): TipEvent => ({ type: 'press', id })

/**
 * Runs the events on a fake clock like the React layer does: a timer starts when the state
 * arms one, is cancelled when the state drops it, and fires `timeout` when its delay has passed.
 */
function clock() {
  let now = 0
  let state: TipState = INITIAL_TIP
  let due: number | null = null
  const apply = (next: TipState) => {
    if (next.timer !== state.timer) {
      due = next.timer ? now + tipDelay(next.timer.kind) : null
    }
    state = next
  }
  return {
    get state() {
      return state
    },
    send(event: TipEvent) {
      apply(reduceTip(state, event))
    },
    /** Moves the clock on, and fires the timer when it is due inside the span */
    advance(ms: number) {
      const until = now + ms
      while (due !== null && due <= until) {
        now = due
        apply(reduceTip(state, { type: 'timeout' }))
      }
      now = until
    },
  }
}

describe('tooltip group: opening', () => {
  it('opens after the delay when the pointer enters the first button', () => {
    const c = clock()
    c.send(enter('search'))
    c.advance(OPEN_DELAY_MS - 1)
    expect(c.state.phase).toBe('pending')
    c.advance(1)
    expect(c.state.phase).toBe('open')
    expect(c.state.target?.id).toBe('search')
    expect(c.state.target?.content.label).toBe('search')
  })

  it('does not open when the pointer leaves before the delay', () => {
    const c = clock()
    c.send(enter('search'))
    c.advance(OPEN_DELAY_MS / 2)
    c.send(leave('search'))
    c.advance(OPEN_DELAY_MS)
    expect(c.state.phase).toBe('closed')
    expect(c.state.timer).toBeNull()
  })

  it('opens at once on keyboard focus', () => {
    const c = clock()
    c.send(focus('undo'))
    expect(c.state.phase).toBe('open')
    expect(c.state.timer).toBeNull()
  })
})

describe('tooltip group: switching', () => {
  it('moves to the next button at once, with its label and no delay', () => {
    const c = clock()
    c.send(enter('search'))
    c.advance(OPEN_DELAY_MS)
    c.send(leave('search'))
    c.send(enter('filters'))
    expect(c.state.phase).toBe('open')
    expect(c.state.target?.id).toBe('filters')
    expect(c.state.timer).toBeNull()
  })

  it('switches at once when the next button is entered during the grace period', () => {
    const c = clock()
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS)
    c.send(leave('a'))
    c.advance(CLOSE_GRACE_MS - 10)
    c.send(enter('b'))
    c.advance(CLOSE_GRACE_MS * 3)
    expect(c.state.phase).toBe('open')
    expect(c.state.target?.id).toBe('b')
  })

  it('keeps the old target while closing, so the box leaves with its label', () => {
    const c = clock()
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS)
    c.send(leave('a'))
    expect(c.state.phase).toBe('closing')
    expect(c.state.target?.content.label).toBe('a')
  })

  it('ignores a leave from a button that is no longer the target', () => {
    const c = clock()
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS)
    c.send(enter('b'))
    c.send(leave('a'))
    expect(c.state.phase).toBe('open')
    expect(c.state.target?.id).toBe('b')
  })

  it('switches from one keyboard focus to the next', () => {
    const c = clock()
    c.send(focus('a'))
    c.send({ type: 'leave', id: 'a' })
    c.send(focus('b'))
    expect(c.state.phase).toBe('open')
    expect(c.state.target?.id).toBe('b')
  })
})

describe('tooltip group: closing', () => {
  it('closes after the grace period when the pointer leaves the group', () => {
    const c = clock()
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS)
    c.send(leave('a'))
    c.advance(CLOSE_GRACE_MS - 1)
    expect(c.state.phase).toBe('closing')
    c.advance(1)
    expect(c.state.phase).toBe('closed')
    expect(c.state.timer).toBeNull()
  })

  it('stays open when the pointer comes back to the same button during the grace period', () => {
    const c = clock()
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS)
    c.send(leave('a'))
    c.advance(CLOSE_GRACE_MS / 2)
    c.send(enter('a'))
    c.advance(CLOSE_GRACE_MS * 2)
    expect(c.state.phase).toBe('open')
  })

  it('closes at once on a press, and not again for that button until the pointer leaves it', () => {
    const c = clock()
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS)
    c.send(press('a'))
    expect(c.state.phase).toBe('closed')
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS * 2)
    expect(c.state.phase).toBe('closed')
    c.send(leave('a'))
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS)
    expect(c.state.phase).toBe('open')
  })

  it('a press on one button does not hold back the next one', () => {
    const c = clock()
    c.send(enter('a'))
    c.advance(OPEN_DELAY_MS)
    c.send(press('a'))
    c.send(leave('a'))
    c.send(enter('b'))
    c.advance(OPEN_DELAY_MS)
    expect(c.state.phase).toBe('open')
    expect(c.state.target?.id).toBe('b')
  })

  it('a blur closes it after the grace period, like a leave', () => {
    const c = clock()
    c.send(focus('a'))
    c.send(leave('a'))
    c.advance(CLOSE_GRACE_MS)
    expect(c.state.phase).toBe('closed')
  })
})

describe('tooltip group: timers', () => {
  it('asks for a timer only while one is needed', () => {
    expect(reduceTip(INITIAL_TIP, enter('a')).timer).toEqual({ kind: 'open' })
    expect(reduceTip(INITIAL_TIP, focus('a')).timer).toBeNull()
    const open = reduceTip(INITIAL_TIP, focus('a'))
    expect(reduceTip(open, leave('a')).timer).toEqual({ kind: 'close' })
    expect(reduceTip(open, enter('b')).timer).toBeNull()
  })

  it('uses the open delay for opening and the grace period for closing', () => {
    expect(tipDelay('open')).toBe(OPEN_DELAY_MS)
    expect(tipDelay('close')).toBe(CLOSE_GRACE_MS)
    expect(OPEN_DELAY_MS).toBeGreaterThan(CLOSE_GRACE_MS)
  })

  it('a timeout with no timer leaves the state as it is', () => {
    const open = reduceTip(INITIAL_TIP, focus('a'))
    expect(reduceTip(open, { type: 'timeout' })).toEqual(open)
  })

  it('does not change the state it is given', () => {
    const before = reduceTip(INITIAL_TIP, enter('a'))
    const snapshot = JSON.stringify(before)
    reduceTip(before, { type: 'timeout' })
    reduceTip(before, leave('a'))
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})
