/**
 * The device the editor runs on, for texts that name a way of working: "Hold ⌥ and type a number" makes sense with a
 * keyboard, not on a phone. The device is two selectors of a message (`messages/*.json`, docs: README.md, "Texts for
 * a device"), so the wording lives with the other texts, in every language, and the code only passes them on:
 *
 *   m.favourites_intro({ key, ...device() })
 *
 * - `input`: how the person works. `keyboard` when there is a fine pointer (mouse, trackpad, pen), which on a desktop
 *   comes with a keyboard; `touch` when the fingers are the only pointer (a phone, a tablet without trackpad).
 * - `os`: whose conventions apply: the names of keys and gestures, the system's menus (iOS's share sheet, Android's ⋮).
 *
 * Like the language it is set once, before the first render (mount.tsx), and read while a text renders.
 */

export const DEVICE_INPUTS = ['keyboard', 'touch'] as const
export const DEVICE_OSES = ['ios', 'android', 'mac', 'windows', 'other'] as const

export type DeviceInput = (typeof DEVICE_INPUTS)[number]
export type DeviceOs = (typeof DEVICE_OSES)[number]
export type Device = { input: DeviceInput; os: DeviceOs }

/** The device without a page (tests, the config check) and under automation: a desktop with a keyboard */
export const DEFAULT_DEVICE: Device = { input: 'keyboard', os: 'other' }

/** What the browser tells about itself; the caller reads it, so that detection stays pure */
export type DeviceSignals = {
  /** `navigator.userAgentData?.platform ?? navigator.platform` */
  platform?: string | undefined
  userAgent?: string | undefined
  /** `navigator.maxTouchPoints` */
  maxTouchPoints?: number | undefined
  /** `matchMedia('(any-pointer: fine)').matches`: a mouse, trackpad or pen is connected */
  finePointer?: boolean | undefined
}

/**
 * The device from the browser's signals. An iPad passes itself off as a Mac (`MacIntel`, a desktop user agent); its
 * touch points give it away, as a Mac has none. An iPad with a trackpad counts as `keyboard`, an Android tablet
 * without one as `touch`, a laptop with a touch screen as `keyboard` (it has a trackpad).
 */
export function detectDevice(signals: DeviceSignals): Device {
  const platform = signals.platform ?? ''
  const agent = signals.userAgent ?? ''
  const touchPoints = signals.maxTouchPoints ?? 0
  let os: DeviceOs = 'other'
  if (/android/i.test(agent) || /android/i.test(platform)) os = 'android'
  else if (/iphone|ipad|ipod/i.test(platform) || /iphone|ipad|ipod/i.test(agent)) os = 'ios'
  else if (/mac/i.test(platform)) os = touchPoints > 1 ? 'ios' : 'mac'
  else if (/win/i.test(platform)) os = 'windows'
  const fine = signals.finePointer ?? touchPoints === 0
  return { input: fine ? 'keyboard' : 'touch', os }
}

/**
 * A device named in the address (`?device=touch`, `?device=ios`, `?device=touch-android`), to see and check a
 * device's texts on another one. Each part names an input or a system; what it leaves out comes from `fallback`.
 * `null` when the value names neither.
 */
export function parseDevice(value: string | null | undefined, fallback: Device): Device | null {
  if (!value) return null
  let input: DeviceInput | undefined
  let os: DeviceOs | undefined
  for (const part of value.toLowerCase().split(/[-,+ ]/)) {
    if ((DEVICE_INPUTS as readonly string[]).includes(part)) input = part as DeviceInput
    else if ((DEVICE_OSES as readonly string[]).includes(part)) os = part as DeviceOs
  }
  if (!input && !os) return null
  // a phone's system without an input is a phone: `?device=ios` shows the touch texts
  const touchOs = os === 'ios' || os === 'android'
  return { input: input ?? (touchOs ? 'touch' : fallback.input), os: os ?? fallback.os }
}

let current: Device = DEFAULT_DEVICE

/** Sets the device of every text from now on. The shell calls it once, before the first render (mount.tsx). */
export function setDevice(next: Device) {
  current = next
}

/**
 * The device as a message's inputs: spread it into the values of a text that has device variants,
 * `m.favourites_intro({ key, ...device() })`. A message without them ignores it.
 */
export function device(): Device {
  return current
}
