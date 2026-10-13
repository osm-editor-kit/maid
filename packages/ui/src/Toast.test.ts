import { beforeEach, describe, expect, it, mock } from 'bun:test'

// sonner is replaced by a recorder: the helpers are tested by what they ask sonner to do
const calls: { method: string; args: unknown[] }[] = []
const record =
  (method: string) =>
  (...args: unknown[]) => {
    calls.push({ method, args })
    return 'id'
  }
void mock.module('sonner', () => ({
  Toaster: () => null,
  toast: Object.assign(record('toast'), {
    success: record('success'),
    info: record('info'),
    warning: record('warning'),
    error: record('error'),
    dismiss: record('dismiss'),
  }),
}))

const { errorText, notify } = await import('./Toast.tsx')

beforeEach(() => {
  calls.length = 0
})

describe('errorText', () => {
  it('takes a string as its own text', () => {
    expect(errorText('The upload failed.')).toBe('The upload failed.')
  })

  it('takes the message of an Error', () => {
    expect(errorText(new Error('Too many requests'))).toBe('Too many requests')
  })

  it('takes the message of an object that has one, as Better Upload errors do', () => {
    expect(errorText({ message: 'File too large' })).toBe('File too large')
  })

  it('uses the fallback for an empty text or an empty message', () => {
    expect(errorText('  ')).toBe('Something went wrong.')
    expect(errorText(new Error(''))).toBe('Something went wrong.')
    expect(errorText({ message: '   ' })).toBe('Something went wrong.')
  })

  it('does not show "[object Object]" as a message', () => {
    expect(errorText({ message: '[object Object]' }, 'The save failed.')).toBe('The save failed.')
  })

  it('uses the fallback for anything else', () => {
    expect(errorText(42, 'Nothing to show.')).toBe('Nothing to show.')
    expect(errorText(undefined)).toBe('Something went wrong.')
    expect(errorText(null, 'Nothing.')).toBe('Nothing.')
  })
})

describe('notify.done and notify.failed', () => {
  it('shows an event as a success that goes away after four seconds', () => {
    notify.done('Imported 1: Parks.')
    expect(calls).toEqual([
      {
        method: 'success',
        args: ['Imported 1: Parks.', { id: undefined, action: undefined, duration: 4000 }],
      },
    ])
  })

  it('shows an error with its message, for six seconds', () => {
    notify.failed(new Error('Boom'))
    expect(calls).toEqual([
      { method: 'error', args: ['Boom', { id: undefined, action: undefined, duration: 6000 }] },
    ])
  })

  it('uses the fallback given for a failure without a message', () => {
    notify.failed(undefined, { fallback: 'The upload failed.' })
    expect(calls[0]?.args[0]).toBe('The upload failed.')
  })
})

describe('notify.standing', () => {
  it('shows a condition as one warning that stays and cannot be closed', () => {
    notify.standing('t-stays', 'Open in another tab.')
    expect(calls).toEqual([
      {
        method: 'warning',
        args: [
          'Open in another tab.',
          {
            id: 't-stays',
            action: undefined,
            duration: Infinity,
            dismissible: false,
            closeButton: false,
          },
        ],
      },
    ])
  })

  it('does not show the same text twice, so a screen reader hears it once', () => {
    notify.standing('t-same', 'Same text.')
    notify.standing('t-same', 'Same text.')
    notify.standing('t-same', 'Same text.')
    expect(calls.filter((call) => call.method === 'warning')).toHaveLength(1)
  })

  it('updates the same toast in place when the text changes', () => {
    notify.standing('t-update', 'Locked.')
    notify.standing('t-update', 'Not kept: storage failed.')
    expect(calls.map((call) => call.args[0])).toEqual(['Locked.', 'Not kept: storage failed.'])
    expect(calls.map((call) => (call.args[1] as { id: string }).id)).toEqual([
      't-update',
      't-update',
    ])
  })

  it('keeps conditions with different ids apart', () => {
    notify.standing('t-a', 'Same.')
    notify.standing('t-b', 'Same.')
    expect(calls.filter((call) => call.method === 'warning')).toHaveLength(2)
  })

  it('dismisses the toast with its id when the condition ends', () => {
    notify.standing('t-clear', 'Open in another tab.')
    notify.clear('t-clear')
    expect(calls.at(-1)).toEqual({ method: 'dismiss', args: ['t-clear'] })
  })

  it('shows the condition again when it returns after a clear', () => {
    notify.standing('t-return', 'Open in another tab.')
    notify.clear('t-return')
    notify.standing('t-return', 'Open in another tab.')
    expect(calls.filter((call) => call.method === 'warning')).toHaveLength(2)
  })

  it('does nothing when clearing an id that was never shown', () => {
    notify.clear('t-never')
    expect(calls).toEqual([])
  })
})
