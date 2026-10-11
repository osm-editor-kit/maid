import { describe, expect, test } from 'bun:test'
import { createHooks, declaredHooks, hookStability } from './hooks.ts'
import './test-fixtures.ts'
import type { ErrorContext } from './index.ts'

function setup() {
  const errors: { error: unknown; context: ErrorContext }[] = []
  const hooks = createHooks((error, context) => errors.push({ error, context }))
  return { hooks, errors }
}

describe('actions', () => {
  test('call listeners in registration order with the arguments', () => {
    const { hooks } = setup()
    const calls: string[] = []
    hooks.on('test:selected', (id) => calls.push(`a:${id}`))
    hooks.on('test:selected', (id) => calls.push(`b:${id}`))
    hooks.run('test:selected', 'n1')
    expect(calls).toEqual(['a:n1', 'b:n1'])
  })

  test('ignore the return value', () => {
    const { hooks } = setup()
    // TypeScript allows this (a function returning a number is assignable to one returning void)
    hooks.on('test:ping', () => 42)
    expect(hooks.run('test:ping')).toBeUndefined()
  })

  test('a throwing listener is reported and the others still run', () => {
    const { hooks, errors } = setup()
    const calls: string[] = []
    hooks.on('test:ping', () => calls.push('first'), 'm1')
    hooks.on(
      'test:ping',
      () => {
        throw new Error('boom')
      },
      'm2',
    )
    hooks.on('test:ping', () => calls.push('third'))
    hooks.run('test:ping')
    expect(calls).toEqual(['first', 'third'])
    expect(errors).toHaveLength(1)
    expect(errors[0]?.context).toEqual({ source: 'action', name: 'test:ping', moduleId: 'm2' })
  })

  test('the remove function removes the listener', () => {
    const { hooks } = setup()
    let n = 0
    const off = hooks.on('test:ping', () => n++)
    hooks.run('test:ping')
    off()
    hooks.run('test:ping')
    expect(n).toBe(1)
  })

  test('a listener that removes itself during a run does not disturb the run', () => {
    const { hooks } = setup()
    const calls: string[] = []
    const off = hooks.on('test:ping', () => {
      calls.push('a')
      off()
    })
    hooks.on('test:ping', () => calls.push('b'))
    hooks.run('test:ping')
    hooks.run('test:ping')
    expect(calls).toEqual(['a', 'b', 'b'])
  })
})

describe('filters', () => {
  test('pass the value through the listeners in order', () => {
    const { hooks } = setup()
    hooks.on('test:title', (title, id) => `${title}+a(${id})`)
    hooks.on('test:title', (title) => `${title}+b`)
    expect(hooks.apply('test:title', 'x', 'n1')).toBe('x+a(n1)+b')
  })

  test('return the input when nobody listens', () => {
    const { hooks } = setup()
    expect(hooks.apply('test:count', 3)).toBe(3)
  })

  test('a throwing listener is skipped and reported, the value carries on', () => {
    const { hooks, errors } = setup()
    hooks.on('test:count', (n) => n + 1)
    hooks.on(
      'test:count',
      () => {
        throw new Error('boom')
      },
      'bad',
    )
    hooks.on('test:count', (n) => n * 10)
    expect(hooks.apply('test:count', 1)).toBe(20)
    expect(errors[0]?.context).toEqual({ source: 'filter', name: 'test:count', moduleId: 'bad' })
  })
})

describe('stability', () => {
  test('is declared with the hook and readable at run time', () => {
    expect(hookStability('test:ping')).toBe('stable')
    expect(hookStability('test:selected')).toBe('experimental')
    expect(declaredHooks().map((h) => h.name)).toContain('test:title')
  })
})
