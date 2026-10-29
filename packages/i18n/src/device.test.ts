import { describe, expect, test } from 'bun:test'
import { DEFAULT_DEVICE, detectDevice, parseDevice } from './device.ts'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const PIXEL =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

describe('detectDevice', () => {
  test('an iPhone is touch on iOS', () => {
    expect(
      detectDevice({
        platform: 'iPhone',
        userAgent: IPHONE,
        maxTouchPoints: 5,
        finePointer: false,
      }),
    ).toEqual({ input: 'touch', os: 'ios' })
  })

  test('an iPad that passes itself off as a Mac is iOS by its touch points', () => {
    expect(
      detectDevice({
        platform: 'MacIntel',
        userAgent: IPAD_AS_MAC,
        maxTouchPoints: 5,
        finePointer: false,
      }),
    ).toEqual({ input: 'touch', os: 'ios' })
  })

  test('an iPad with a trackpad works with a keyboard', () => {
    expect(
      detectDevice({
        platform: 'MacIntel',
        userAgent: IPAD_AS_MAC,
        maxTouchPoints: 5,
        finePointer: true,
      }),
    ).toEqual({ input: 'keyboard', os: 'ios' })
  })

  test('a Mac is a keyboard on macOS', () => {
    expect(
      detectDevice({
        platform: 'macOS',
        userAgent: IPAD_AS_MAC,
        maxTouchPoints: 0,
        finePointer: true,
      }),
    ).toEqual({ input: 'keyboard', os: 'mac' })
  })

  test('an Android phone is touch on Android, whatever its platform string says', () => {
    expect(
      detectDevice({
        platform: 'Linux armv81',
        userAgent: PIXEL,
        maxTouchPoints: 5,
        finePointer: false,
      }),
    ).toEqual({ input: 'touch', os: 'android' })
  })

  test('Windows with a touch screen and a trackpad is a keyboard', () => {
    expect(detectDevice({ platform: 'Win32', maxTouchPoints: 10, finePointer: true })).toEqual({
      input: 'keyboard',
      os: 'windows',
    })
  })

  test('without a pointer query, touch points decide', () => {
    expect(detectDevice({ platform: 'Linux x86_64' })).toEqual({ input: 'keyboard', os: 'other' })
    expect(detectDevice({ platform: 'Linux x86_64', maxTouchPoints: 5 }).input).toBe('touch')
  })
})

describe('parseDevice', () => {
  test('an input alone keeps the system', () => {
    expect(parseDevice('touch', { input: 'keyboard', os: 'mac' })).toEqual({
      input: 'touch',
      os: 'mac',
    })
  })

  test("a phone's system alone is a phone", () => {
    expect(parseDevice('ios', DEFAULT_DEVICE)).toEqual({ input: 'touch', os: 'ios' })
    expect(parseDevice('android', DEFAULT_DEVICE)).toEqual({ input: 'touch', os: 'android' })
  })

  test('both, in either order and with any separator', () => {
    expect(parseDevice('keyboard-ios', DEFAULT_DEVICE)).toEqual({ input: 'keyboard', os: 'ios' })
    expect(parseDevice('Android,touch', DEFAULT_DEVICE)).toEqual({ input: 'touch', os: 'android' })
  })

  test('nothing it knows is null', () => {
    expect(parseDevice('fridge', DEFAULT_DEVICE)).toBeNull()
    expect(parseDevice('', DEFAULT_DEVICE)).toBeNull()
    expect(parseDevice(null, DEFAULT_DEVICE)).toBeNull()
  })
})
