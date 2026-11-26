/** IncrementalSource's diff and updates (incremental.ts) against a fake map that records what it was sent */
import { describe, expect, test } from 'bun:test'
import type { Feature } from 'geojson'
import { Holder, type UpdateMap } from './incremental.ts'

type Sent = { add: Feature[]; remove: (string | number)[] }

function fakeMap() {
  const updates: Sent[] = []
  const whole: number[] = []
  let release: (() => void) | undefined
  let hold = false
  const source = {
    updateData(diff: Sent) {
      updates.push(diff)
      return hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
    },
    setData(collection: { features: Feature[] }) {
      whole.push(collection.features.length)
    },
  }
  const map = {
    getSource: () => source,
    isSourceLoaded: () => true,
    on: () => map,
    off: () => map,
  } as unknown as UpdateMap
  return {
    map,
    updates,
    whole,
    holdNext: () => (hold = true),
    release: () => {
      hold = false
      release?.()
    },
  }
}

const point = (n: number): Feature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [n, n] },
  properties: {},
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('Holder', () => {
  test('sends only the features that are new or gone, by object', async () => {
    const fake = fakeMap()
    const [a, b, c] = [point(1), point(2), point(3)]
    const holder = new Holder([a, b])
    holder.apply(fake.map, 's', [a, c])
    await tick()
    expect(fake.updates).toHaveLength(1)
    expect(fake.updates[0]!.add).toEqual([c])
    expect(fake.updates[0]!.remove).toEqual([b.id!])
    expect(holder.collection.features).toEqual([a, c])
  })

  test('nothing goes out when nothing changed', async () => {
    const fake = fakeMap()
    const a = point(1)
    const holder = new Holder([a])
    holder.apply(fake.map, 's', [a])
    await tick()
    expect(fake.updates).toHaveLength(0)
  })

  test('updates wait for the one in flight and go out together; a removal is never dropped', async () => {
    const fake = fakeMap()
    const [a, b, c] = [point(1), point(2), point(3)]
    const holder = new Holder([a])
    fake.holdNext()
    holder.apply(fake.map, 's', [a, b]) // in flight
    holder.apply(fake.map, 's', [a]) // b gone again while busy
    holder.apply(fake.map, 's', [a, c])
    await tick()
    expect(fake.updates).toHaveLength(1)
    fake.release()
    await tick()
    await tick()
    expect(fake.updates).toHaveLength(2)
    expect(fake.updates[1]!.add).toEqual([c])
    // b reached the source with the first update, so it must be removed
    expect(fake.updates[1]!.remove).toEqual([b.id!])
  })

  test('the whole collection goes out once after removals, not after additions only', async () => {
    const fake = fakeMap()
    const [a, b] = [point(1), point(2)]
    const holder = new Holder([a])
    holder.apply(fake.map, 's', [a, b])
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(fake.whole).toEqual([])
    holder.apply(fake.map, 's', [b])
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(fake.whole).toEqual([1])
  })

  test('after dispose nothing more goes out, not even the pending reconcile', async () => {
    const fake = fakeMap()
    const [a, b] = [point(1), point(2)]
    const holder = new Holder([a, b])
    holder.apply(fake.map, 's', [a])
    await tick()
    holder.dispose()
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(fake.whole).toEqual([])
  })
})
