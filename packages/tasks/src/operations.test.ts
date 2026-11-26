import { describe, expect, it } from 'bun:test'
import { parseTaskFile } from './parse.ts'
import { errorsOf, option, pointTask, taskFile } from './test-helpers.ts'

const withOptions = (...options: unknown[]) =>
  taskFile([pointTask('t-1', { osm: ['way/1'], options })])

describe('options that run operations', () => {
  it('accepts operations on a tag option, with or without tags', () => {
    const reverseOnly = { id: 'rev', label: 'Reverse', operations: [{ op: 'reverse' }] }
    const reverseAndSet = option({ operations: [{ op: 'reverse' }], set: { oneway: 'yes' } })
    expect(parseTaskFile(withOptions(reverseOnly, { ...reverseAndSet, id: 'b' })).ok).toBe(true)
  })

  it('refuses an unknown operation and operations on other actions', () => {
    const unknown = errorsOf(withOptions(option({ operations: [{ op: 'explode' }] })))
    expect(unknown.some((error) => error.message.startsWith('op must be one of'))).toBe(true)
    const onDelete = errorsOf(
      withOptions({ id: 'd', label: 'Delete', action: 'delete', operations: [{ op: 'reverse' }] }),
    )
    expect(onDelete.some((error) => error.message === 'only a "tag" option runs operations')).toBe(
      true,
    )
  })

  it('accepts an answer without a change, and nothing else on it', () => {
    expect(
      parseTaskFile(withOptions({ id: 'ok', label: 'Direction is right', action: 'none' })).ok,
    ).toBe(true)
    const withSet = errorsOf(
      withOptions({ id: 'ok', label: 'Right', action: 'none', set: { a: 'b' } }),
    )
    expect(withSet.some((error) => error.message.includes('"none" option changes nothing'))).toBe(
      true,
    )
  })
})
