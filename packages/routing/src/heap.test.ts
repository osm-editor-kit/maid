import { describe, expect, it } from 'bun:test'
import { MinHeap } from './heap.ts'

describe('MinHeap', () => {
  it('pops values in key order, across a growth of the storage', () => {
    const heap = new MinHeap(2)
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const keys = Array.from({ length: 300 }, () => Math.floor(random() * 1000))
    keys.forEach((key, i) => heap.push(key, i))
    const popped: number[] = []
    while (heap.size > 0) {
      heap.pop()
      popped.push(heap.poppedKey)
    }
    expect(popped).toEqual([...keys].sort((a, b) => a - b))
  })

  it('returns the value with its key', () => {
    const heap = new MinHeap()
    heap.push(5, 50)
    heap.push(1, 10)
    heap.push(3, 30)
    expect(heap.pop()).toBe(10)
    expect(heap.poppedKey).toBe(1)
    expect(heap.pop()).toBe(30)
    expect(heap.size).toBe(1)
  })
})
