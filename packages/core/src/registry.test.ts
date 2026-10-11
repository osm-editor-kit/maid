import { describe, expect, test } from 'bun:test'
import { createRegistry } from './registry.ts'

interface Item {
  id: string
}

describe('registry', () => {
  test('keeps registration order and reads by id', () => {
    const registry = createRegistry<Item>('x', () => {})
    registry.add({ id: 'b' })
    registry.add({ id: 'a' })
    expect(registry.list().map((i) => i.id)).toEqual(['b', 'a'])
    expect(registry.get('a')).toEqual({ id: 'a' })
    expect(registry.get('nope')).toBeUndefined()
  })

  test('throws on a duplicate id', () => {
    const registry = createRegistry<Item>('x', () => {})
    registry.add({ id: 'a' })
    expect(() => registry.add({ id: 'a' })).toThrow('already has an item with the id "a"')
  })

  test('remove works once and only removes its own item', () => {
    const registry = createRegistry<Item>('x', () => {})
    const remove = registry.add({ id: 'a' })
    remove()
    expect(registry.list()).toEqual([])
    const second = { id: 'a' }
    registry.add(second)
    remove()
    expect(registry.get('a')).toBe(second)
  })

  test('subscribers get the new list on add and remove, and can unsubscribe', () => {
    const registry = createRegistry<Item>('x', () => {})
    const seen: string[][] = []
    const unsubscribe = registry.subscribe((items) => seen.push(items.map((i) => i.id)))
    const remove = registry.add({ id: 'a' })
    registry.add({ id: 'b' })
    remove()
    unsubscribe()
    registry.add({ id: 'c' })
    expect(seen).toEqual([['a'], ['a', 'b'], ['b']])
  })

  test('list returns a new array after a change', () => {
    const registry = createRegistry<Item>('x', () => {})
    const before = registry.list()
    registry.add({ id: 'a' })
    expect(registry.list()).not.toBe(before)
    expect(before).toEqual([])
  })

  test('a throwing subscriber is reported and does not stop the others', () => {
    const errors: unknown[] = []
    const registry = createRegistry<Item>('x', (e) => errors.push(e))
    const seen: number[] = []
    registry.subscribe(() => {
      throw new Error('boom')
    })
    registry.subscribe((items) => seen.push(items.length))
    registry.add({ id: 'a' })
    expect(seen).toEqual([1])
    expect(errors).toHaveLength(1)
  })
})
