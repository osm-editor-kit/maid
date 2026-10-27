/** A seeded pseudo-random source. Each method draws the next numbers of the sequence. */
export type Random = {
  /** A number from 0 (included) to 1 (excluded) */
  next(): number
  /** A whole number from `min` to `max`, both included */
  int(min: number, max: number): number
  /** A random element of a non-empty array */
  pick<T>(items: readonly T[]): T
  /** `k` different whole numbers from 0 to `count - 1`, in random order */
  distinct(count: number, k: number): number[]
  /** True with probability `p` */
  chance(p: number): boolean
}

/** The item at `index`. Throws when there is none, for indexes that the caller knows are in range. */
export function at<T>(items: ArrayLike<T>, index: number): T {
  const item = items[index]
  if (item === undefined) throw new RangeError(`index ${index} is out of range`)
  return item
}

/**
 * A seeded generator (mulberry32). The same seed gives the same sequence on every run and machine, so generated
 * routes and mutations can be reproduced from their seed.
 */
export function seededRandom(seed: number): Random {
  let state = seed | 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int(min, max) {
      if (max < min) throw new RangeError(`int: ${max} is below ${min}`)
      return min + Math.floor(next() * (max - min + 1))
    },
    pick(items) {
      return at(items, Math.floor(next() * items.length))
    },
    distinct(count, k) {
      const n = Math.min(k, count)
      const pool = new Int32Array(count)
      for (let i = 0; i < count; i++) pool[i] = i
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(next() * (count - i))
        const swap = pool[i] ?? 0
        pool[i] = pool[j] ?? 0
        pool[j] = swap
      }
      return Array.from(pool.subarray(0, n))
    },
    chance(p) {
      return next() < p
    },
  }
}
