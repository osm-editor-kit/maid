import { describe, expect, test } from 'bun:test'
import { activeProviders, DEFAULT_STORED, parseStored } from './state.ts'

describe('the photo state of a new visitor', () => {
  test('no provider is on: nothing is requested, with or without a Mapillary token', () => {
    expect(DEFAULT_STORED.providers).toEqual([])
    const fromStorage = parseStored(undefined)
    expect(activeProviders(fromStorage.providers, undefined, false)).toEqual([])
    expect(activeProviders(fromStorage.providers, 'MLY|token', false)).toEqual([])
  })

  test('a stored choice is kept as it was made', () => {
    const stored = parseStored({ providers: ['panoramax'] })
    expect(stored.providers).toEqual(['panoramax'])
    expect(activeProviders(stored.providers, undefined, false)).toEqual(['panoramax'])
  })

  test('a stored choice of no provider stays no provider, even when a token is set', () => {
    const stored = parseStored({ providers: [] })
    expect(activeProviders(stored.providers, 'MLY|token', false)).toEqual([])
  })
})
