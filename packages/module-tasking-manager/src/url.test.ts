import { expect, test } from 'bun:test'
import { parseAsTmLink, parseTmLink } from './url.ts'

test('a project, a project with a task, a TM link', () => {
  expect(parseTmLink('4242')).toEqual({ projectId: 4242, taskId: null })
  expect(parseTmLink('4242/22')).toEqual({ projectId: 4242, taskId: 22 })
  expect(parseTmLink('https://tasks.hotosm.org/projects/4242/tasks')).toEqual({
    projectId: 4242,
    taskId: null,
  })
})

test('anything else is no link', () => {
  expect(parseTmLink('')).toBeNull()
  expect(parseTmLink('abc/1')).toBeNull()
  expect(parseTmLink('0')).toBeNull()
})

test('serialize gives back what parse reads', () => {
  for (const value of ['4242', '4242/22']) {
    const link = parseAsTmLink.parse(value)
    expect(link && parseAsTmLink.serialize(link)).toBe(value)
  }
})
