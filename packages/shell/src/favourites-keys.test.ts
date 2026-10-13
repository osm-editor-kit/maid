import { describe, expect, it } from 'bun:test'
import {
  advance,
  digitOfCode,
  IDLE,
  sequenceEventOf,
  type KeyInput,
  type SequenceEvent,
  type SequenceState,
} from './favourites-keys.ts'

const down: SequenceEvent = { type: 'modifier-down' }
const up: SequenceEvent = { type: 'modifier-up' }
const digit = (d: string): SequenceEvent => ({ type: 'digit', digit: d })

/** Runs events from `from`, and returns the final state and every number started on the way */
function run(events: SequenceEvent[], from: SequenceState = IDLE) {
  let state = from
  const starts: string[] = []
  for (const event of events) {
    const step = advance(state, event)
    state = step.state
    if (step.start !== undefined) starts.push(step.start)
  }
  return { state, starts }
}

const key = (overrides: Partial<KeyInput>): KeyInput => ({
  type: 'keydown',
  key: '3',
  code: 'Digit3',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  inField: false,
  ...overrides,
})

describe('starting a favourite by its number', () => {
  it('one digit: hold, type it, release starts that number', () => {
    expect(run([down, digit('3'), up]).starts).toEqual(['3'])
  })

  it('two digits: 3 then 9 starts 39, and 3 alone is not started', () => {
    const { starts, state } = run([down, digit('3'), digit('9')], IDLE)
    expect(state.digits).toBe('39')
    expect(starts).toEqual([])
    expect(run([down, digit('3'), digit('9'), up]).starts).toEqual(['39'])
  })

  it('three equal digits: 8, 8, 8 starts 888', () => {
    expect(run([down, digit('8'), digit('8'), digit('8'), up]).starts).toEqual(['888'])
  })

  it('a zero inside or after other digits is kept', () => {
    expect(run([down, digit('1'), digit('0'), up]).starts).toEqual(['10'])
    expect(run([down, digit('1'), digit('0'), digit('0'), up]).starts).toEqual(['100'])
  })

  it('a leading zero is ignored: 0 alone starts nothing, 03 is 3', () => {
    expect(run([down, digit('0'), up]).starts).toEqual([])
    expect(run([down, digit('0'), digit('0'), digit('3'), up]).starts).toEqual(['3'])
  })

  it('a digit without the modifier does nothing', () => {
    expect(advance(IDLE, digit('3'))).toEqual({ state: IDLE })
    expect(run([digit('3'), digit('9'), up]).starts).toEqual([])
    // the modifier released after the digits typed without it: nothing either
    expect(run([digit('3'), down, up]).starts).toEqual([])
  })

  it('releasing the modifier with no digits starts nothing', () => {
    expect(run([down, up]).starts).toEqual([])
    expect(run([down, up]).state).toEqual(IDLE)
  })

  it('a number without a favourite is still reported: the caller finds no favourite for it', () => {
    expect(run([down, digit('7'), up]).starts).toEqual(['7'])
  })

  it('a key that repeats while the modifier is held does not start a new sequence', () => {
    const { state } = run([down, digit('3'), down])
    expect(state.digits).toBe('3')
  })

  it('a number can be as long as one wants', () => {
    const digits = '1234567890123456789012345'.split('')
    expect(run([down, ...digits.map(digit), up]).starts).toEqual([digits.join('')])
  })
})

describe('Escape, blur and Backspace', () => {
  it('Escape while holding cancels: releasing starts nothing', () => {
    expect(run([down, digit('3'), { type: 'escape' }, up]).starts).toEqual([])
  })

  it('after Escape, digits typed while still holding start nothing either', () => {
    const { starts, state } = run([down, digit('3'), { type: 'escape' }, digit('9'), up])
    expect(starts).toEqual([])
    expect(state).toEqual(IDLE)
  })

  it('Escape without the modifier does nothing', () => {
    expect(advance(IDLE, { type: 'escape' })).toEqual({ state: IDLE })
  })

  it('losing window focus cancels: releasing afterwards starts nothing', () => {
    expect(run([down, digit('3'), digit('9'), { type: 'blur' }, up]).starts).toEqual([])
    expect(run([down, digit('3'), { type: 'blur' }]).state).toEqual(IDLE)
  })

  it('Backspace while holding removes the last digit', () => {
    expect(
      run([down, digit('3'), digit('9'), { type: 'backspace' }, digit('4'), up]).starts,
    ).toEqual(['34'])
  })

  it('Backspace takes a single digit away, and an empty sequence stays empty', () => {
    expect(run([down, digit('3'), { type: 'backspace' }, up]).starts).toEqual([])
    expect(run([down, { type: 'backspace' }, up]).starts).toEqual([])
    expect(advance(IDLE, { type: 'backspace' })).toEqual({ state: IDLE })
  })
})

describe('the state the hint reads', () => {
  it('is held with the digits so far while the modifier is down', () => {
    expect(run([down, digit('3'), digit('9')]).state).toEqual({
      held: true,
      digits: '39',
      cancelled: false,
    })
  })
})

describe('turning key events into sequence events', () => {
  it('reads the digit from the key code, so Option or the layout does not matter', () => {
    expect(digitOfCode('Digit3')).toBe('3')
    expect(digitOfCode('Numpad7')).toBe('7')
    expect(digitOfCode('KeyA')).toBeUndefined()
    // Option+1 on macOS types "¡", but the key code is still Digit1
    expect(sequenceEventOf(key({ key: '¡', code: 'Digit1', altKey: true }))).toEqual({
      type: 'digit',
      digit: '1',
    })
    expect(sequenceEventOf(key({ code: 'Numpad9', key: '9', altKey: true }))).toEqual({
      type: 'digit',
      digit: '9',
    })
  })

  it('the modifier goes down and up; a repeat of its keydown is nothing', () => {
    expect(sequenceEventOf(key({ key: 'Alt', code: 'AltLeft', altKey: true }))).toEqual(down)
    expect(sequenceEventOf(key({ key: 'Alt', code: 'AltLeft', repeat: true }))).toBeUndefined()
    expect(sequenceEventOf(key({ type: 'keyup', key: 'Alt', code: 'AltRight' }))).toEqual(up)
  })

  it('a digit without Alt is nothing: the existing shortcuts 1 to 3 are untouched', () => {
    expect(sequenceEventOf(key({ code: 'Digit3', key: '3' }))).toBeUndefined()
    expect(sequenceEventOf(key({ code: 'Digit1', key: '1' }))).toBeUndefined()
  })

  it('Alt with another modifier is another shortcut', () => {
    expect(sequenceEventOf(key({ altKey: true, ctrlKey: true }))).toBeUndefined()
    expect(sequenceEventOf(key({ altKey: true, metaKey: true }))).toBeUndefined()
    expect(sequenceEventOf(key({ altKey: true, shiftKey: true }))).toBeUndefined()
  })

  it('a repeated digit key types nothing', () => {
    expect(sequenceEventOf(key({ altKey: true, repeat: true }))).toBeUndefined()
  })

  it('typing in a field is never a sequence, neither the digits nor Escape or Backspace', () => {
    expect(sequenceEventOf(key({ altKey: true, inField: true }))).toBeUndefined()
    expect(
      sequenceEventOf(key({ altKey: true, key: 'Escape', code: 'Escape', inField: true })),
    ).toBeUndefined()
    expect(
      sequenceEventOf(key({ altKey: true, key: 'Backspace', code: 'Backspace', inField: true })),
    ).toBeUndefined()
  })

  it('Backspace and Escape with Alt are the sequence keys; other keys are nothing', () => {
    expect(sequenceEventOf(key({ altKey: true, key: 'Backspace', code: 'Backspace' }))).toEqual({
      type: 'backspace',
    })
    expect(sequenceEventOf(key({ altKey: true, key: 'Escape', code: 'Escape' }))).toEqual({
      type: 'escape',
    })
    expect(sequenceEventOf(key({ altKey: true, key: 'v', code: 'KeyV' }))).toBeUndefined()
  })
})
