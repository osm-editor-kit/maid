import { describe, expect, test } from 'bun:test'
import { journalSettled } from './bench'

function fakeJournal(first: string) {
  let status = first
  const listeners = new Set<() => void>()
  return {
    getState: () => ({ status }) as never,
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
    set(next: string) {
      status = next
      for (const l of [...listeners]) l()
    },
  }
}

describe('journalSettled', () => {
  test('waits while the journal is checking or restoring, resolves when it runs', async () => {
    const journal = fakeJournal('checking')
    let done = false
    const promise = journalSettled(journal).then(() => (done = true))
    await Promise.resolve()
    expect(done).toBe(false)
    journal.set('running')
    await promise
    expect(done).toBe(true)
  })
  test('resolves at once when nothing is being checked, and at the question', async () => {
    await journalSettled(fakeJournal('running'))
    await journalSettled(fakeJournal('pending'))
  })
})
