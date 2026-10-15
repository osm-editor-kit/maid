import { describe, expect, it } from 'bun:test'
import {
  existingActions,
  existingMode,
  restoreAlways,
  showsExisting,
} from './validation-existing-store.ts'

describe('the stored setting for issues in existing data', () => {
  it('is Always only for a stored value that says so', () => {
    expect(restoreAlways({ always: true })).toBe(true)
    expect(restoreAlways({ always: false })).toBe(false)
    expect(restoreAlways({ always: 'yes' })).toBe(false)
    expect(restoreAlways({ mode: 'always' })).toBe(false)
    expect(restoreAlways('always')).toBe(false)
    expect(restoreAlways(undefined)).toBe(false)
  })

  it('shows the issues of existing data in This session and Always only', () => {
    expect(showsExisting('quiet')).toBe(false)
    expect(showsExisting('session')).toBe(true)
    expect(showsExisting('always')).toBe(true)
  })
})

describe('the setting: Quiet, This session, Always', () => {
  it('a fix or an edit of existing data flips Quiet to This session once, and says so', () => {
    existingActions.setMode('quiet')
    expect(existingMode()).toBe('quiet')
    expect(existingActions.signal()).toBe(true)
    expect(existingMode()).toBe('session')
    // already shown: nothing changes, and no notice
    expect(existingActions.signal()).toBe(false)
    expect(existingMode()).toBe('session')
  })

  it('a signal changes nothing when the setting is Always', () => {
    existingActions.setMode('always')
    expect(existingActions.signal()).toBe(false)
    expect(existingMode()).toBe('always')
  })

  it('Keep them quiet (Quiet) makes the next signal flip again', () => {
    existingActions.setMode('session')
    existingActions.setMode('quiet')
    expect(existingMode()).toBe('quiet')
    expect(existingActions.signal()).toBe(true)
    expect(existingMode()).toBe('session')
  })

  it('choosing This session after Always leaves Always, and choosing Always keeps the session too', () => {
    existingActions.setMode('always')
    existingActions.setMode('session')
    expect(existingMode()).toBe('session')
    existingActions.setMode('always')
    expect(existingMode()).toBe('always')
  })

  it('tells the subscribers of each change', () => {
    let calls = 0
    const stop = existingActions.subscribe(() => {
      calls++
    })
    existingActions.setMode('quiet')
    existingActions.setMode('session')
    stop()
    existingActions.setMode('quiet')
    expect(calls).toBe(2)
    existingActions.setMode('quiet')
  })
})
