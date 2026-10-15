// A binary min-heap of (key, value) pairs with integer values. Written for the router: the values are
// state ids, so the storage is two typed arrays that grow by doubling, and pop returns the value
// with its key left in `poppedKey` (no allocation per pop).

export class MinHeap {
  private keys: Float64Array
  private values: Int32Array
  private count = 0
  /** The key of the value the last `pop` returned */
  public poppedKey = Number.NaN

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity)
    this.values = new Int32Array(capacity)
  }

  get size(): number {
    return this.count
  }

  push(key: number, value: number): void {
    if (this.count === this.keys.length) this.grow()
    let i = this.count++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent]! <= key) break
      this.keys[i] = this.keys[parent]!
      this.values[i] = this.values[parent]!
      i = parent
    }
    this.keys[i] = key
    this.values[i] = value
  }

  /** Removes and returns the value with the smallest key. The heap must not be empty */
  pop(): number {
    const top = this.values[0]!
    this.poppedKey = this.keys[0]!
    const last = --this.count
    if (last > 0) {
      const key = this.keys[last]!
      const value = this.values[last]!
      let i = 0
      for (;;) {
        let child = 2 * i + 1
        if (child >= last) break
        if (child + 1 < last && this.keys[child + 1]! < this.keys[child]!) child++
        if (this.keys[child]! >= key) break
        this.keys[i] = this.keys[child]!
        this.values[i] = this.values[child]!
        i = child
      }
      this.keys[i] = key
      this.values[i] = value
    }
    return top
  }

  private grow(): void {
    const keys = new Float64Array(this.keys.length * 2)
    keys.set(this.keys)
    const values = new Int32Array(this.values.length * 2)
    values.set(this.values)
    this.keys = keys
    this.values = values
  }
}
