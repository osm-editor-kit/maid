import { PREF_LIMITS } from './transport.ts'

/**
 * Cuts a long text into pieces of at most `max` characters, so that each piece fits one preference value.
 * Empty text gives no pieces, and no piece is empty. Only ASCII is accepted, because the codec output is
 * base64url: a character count is then also a byte count. Any other character throws a `RangeError`.
 */
export function splitValue(text: string, max: number = PREF_LIMITS.valueMax): string[] {
  if (!Number.isInteger(max) || max < 1)
    throw new RangeError(`The piece size must be a whole number of at least 1, not ${max}`)
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) > 0x7f)
      throw new RangeError(`Only ASCII can be split; character ${index} is not`)
  }
  const pieces: string[] = []
  for (let start = 0; start < text.length; start += max) pieces.push(text.slice(start, start + max))
  return pieces
}
