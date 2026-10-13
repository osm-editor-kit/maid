/**
 * The map's turn (bearing) in degrees, as MapLibre counts it: positive turns the map
 * counter-clockwise, so a north arrow on the screen points at `-bearing`. Pure: the URL (params.ts)
 * and the keys (useShortcuts.ts) use it.
 */

/** Shift with the left or right arrow turns the map by this many degrees, as Rapid does */
export const TURN_STEP = 2.5

/** A bearing from -180 (included) to 180 (not included), the range the URL and the stored position keep */
export function normaliseBearing(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180
}

/**
 * The turn of one press of Shift with an arrow. Shift+Right turns the map clockwise, as in Rapid:
 * clockwise is a lower bearing.
 */
export function turnForKey(key: 'ArrowLeft' | 'ArrowRight'): number {
  return key === 'ArrowRight' ? -TURN_STEP : TURN_STEP
}

/** Rounded to hundredths of a degree, the precision the URL writes */
export function roundDegrees(degrees: number): number {
  return Math.round(degrees * 100) / 100
}
