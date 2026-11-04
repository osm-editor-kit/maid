import { describe, expect, test } from 'bun:test'
import { orderHash, taskIndex } from './order.ts'
import { parseTaskFile } from './parse.ts'
import { errorsOf, pointTask, taskFile } from './test-helpers.ts'

function filesOf(ids: string[]) {
  const result = parseTaskFile(taskFile(ids.map((id) => pointTask(id))))
  if (!result.ok)
    throw new Error(JSON.stringify(errorsOf(taskFile(ids.map((id) => pointTask(id))))))
  return result.file
}

describe('orderHash', () => {
  test('is 8 characters of base36', () => {
    expect(orderHash(filesOf(['t-1', 't-2', 't-3']))).toMatch(/^[0-9a-z]{8}$/)
  })

  test('is the same on every call for the same ids', () => {
    const file = filesOf(['t-1', 't-2', 't-3'])
    expect(orderHash(file)).toBe(orderHash(file))
    expect(orderHash(filesOf(['t-1', 't-2', 't-3']))).toBe(orderHash(file))
  })

  test('pins the value of a known file, checked against an independent FNV-1a in Python', () => {
    expect(orderHash(filesOf(['t-1', 't-2', 't-3']))).toBe('01x18jhs')
  })

  test('changes when the order changes', () => {
    expect(orderHash(filesOf(['t-2', 't-1', 't-3']))).not.toBe(
      orderHash(filesOf(['t-1', 't-2', 't-3'])),
    )
  })

  test('changes when an id changes or a task is added', () => {
    const base = orderHash(filesOf(['t-1', 't-2']))
    expect(orderHash(filesOf(['t-1', 't-9']))).not.toBe(base)
    expect(orderHash(filesOf(['t-1', 't-2', 't-3']))).not.toBe(base)
  })

  test('depends only on the ids: a changed title keeps the hash', () => {
    const plain = filesOf(['t-1', 't-2'])
    const retitled = parseTaskFile(
      taskFile([pointTask('t-1', { title: 'Other' }), pointTask('t-2')]),
    )
    if (!retitled.ok) throw new Error('expected a valid file')
    expect(orderHash(retitled.file)).toBe(orderHash(plain))
  })

  test('the ids are not joined so that "a" "bc" differs from "ab" "c"', () => {
    expect(orderHash(filesOf(['a', 'bc']))).not.toBe(orderHash(filesOf(['ab', 'c'])))
  })

  test('an empty file has a hash too', () => {
    expect(orderHash(filesOf([]))).toMatch(/^[0-9a-z]{8}$/)
  })
})

describe('taskIndex', () => {
  test('maps each task id to its position in the file', () => {
    const index = taskIndex(filesOf(['t-b', 't-a', 't-c']))
    expect(index.get('t-b')).toBe(0)
    expect(index.get('t-a')).toBe(1)
    expect(index.get('t-c')).toBe(2)
    expect(index.get('t-x')).toBeUndefined()
    expect(index.size).toBe(3)
  })
})
