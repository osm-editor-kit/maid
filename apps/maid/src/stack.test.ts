import { beforeEach, describe, expect, test } from 'bun:test'
import {
  currentStack,
  dropStackUnless,
  keepsStack,
  setStack,
  stepStackId,
  type Stack,
} from './stack'

const ids = ['n1', 'w2', 'w3']
const stack: Stack = { lon: 13.4, lat: 52.5, ids }

describe('stepStackId', () => {
  test('next and previous walk the stack in its order', () => {
    expect(stepStackId(ids, 'n1', 1)).toBe('w2')
    expect(stepStackId(ids, 'w2', 1)).toBe('w3')
    expect(stepStackId(ids, 'w3', -1)).toBe('w2')
  })

  test('wraps round both ends', () => {
    expect(stepStackId(ids, 'w3', 1)).toBe('n1')
    expect(stepStackId(ids, 'n1', -1)).toBe('w3')
  })

  test('a feature that is not in the stack: next is the first, previous the last', () => {
    expect(stepStackId(ids, 'x9', 1)).toBe('n1')
    expect(stepStackId(ids, 'x9', -1)).toBe('w3')
  })

  test('one feature steps to itself, an empty stack to nothing', () => {
    expect(stepStackId(['w1'], 'w1', 1)).toBe('w1')
    expect(stepStackId([], 'w1', 1)).toBeUndefined()
  })
})

describe('keepsStack', () => {
  test('one selected feature of the stack keeps it', () => {
    expect(keepsStack(stack, ['w2'])).toBe(true)
  })

  test('nothing, several features, or a feature outside the stack drop it', () => {
    expect(keepsStack(stack, [])).toBe(false)
    expect(keepsStack(stack, ['w2', 'n1'])).toBe(false)
    expect(keepsStack(stack, ['w9'])).toBe(false)
  })
})

describe('the stack in the store', () => {
  beforeEach(() => setStack(null))

  test('a selection of one of its features keeps it', () => {
    setStack(stack)
    dropStackUnless(['w3'])
    expect(currentStack()).toEqual(stack)
  })

  test('any other selection drops it', () => {
    setStack(stack)
    dropStackUnless(['w9'])
    expect(currentStack()).toBeNull()
    setStack(stack)
    dropStackUnless([])
    expect(currentStack()).toBeNull()
  })

  test('dropping without a stack changes nothing', () => {
    dropStackUnless(['w1'])
    expect(currentStack()).toBeNull()
  })
})
