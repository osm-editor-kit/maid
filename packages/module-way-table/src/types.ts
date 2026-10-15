/**
 * The shared shapes of the way table's pure logic (see docs/research/way-table.md). No React, no store.
 */

/** Tags of one way, as stored in OSM */
export type Tags = Readonly<Record<string, string>>

/**
 * One column of the table: a way (or an area) with its stored tags. `reversed` says the way points against the
 * reference's direction; then its directional keys and values are mirrored for display and comparison.
 */
export type Column = {
  readonly id: string
  readonly tags: Tags
  readonly reversed: boolean
  readonly readOnly?: boolean
}

/** A way and its direction relative to the chain's reference: `backward` is left of it, `forward` right */
export type Direction = 'backward' | 'forward'
