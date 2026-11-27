/** IncrementalSource's diff and updates (incremental.ts) against a fake map that records what it was sent */
import { describe, expect, test } from 'bun:test'
import type { Feature } from 'geojson'
import { Holder, type UpdateMap } from './incremental.ts'

type Sent = { add: Feature[]; remove: (string | number)[] }

function fakeMap() {
  const updates: Sent[] = []
  /** The collections sent whole with `setData` */
  const whole: { features: Feature[] }[] = []
  let release: (() => void) | undefined
  let hold = false
  const handlers = new Map<string, Set<() => void>>()
  /** A source made from `data`, as `addSource` makes it; `serialize` returns that object until an update */
  const makeSource = (data?: unknown) => {
    let held = data
    return {
      updateData(diff: Sent) {
        held = undefined
        updates.push(diff)
        return hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
      },
      setData(collection: { features: Feature[] }) {
        held = collection
        whole.push(collection)
        return Promise.resolve()
      },
      serialize: () => ({ type: 'geojson', data: held }),
    }
  }
  let source: ReturnType<typeof makeSource> | undefined
  const map = {
    getSource: () => source,
    isSourceLoaded: () => true,
    on: (type: string, handler: () => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
      return map
    },
    off: (type: string, handler: () => void) => {
      handlers.get(type)?.delete(handler)
      return map
    },
  } as unknown as UpdateMap
  return {
    map,
    updates,
    whole,
    /** react-map-gl adds the source with this data (a Holder's `collection`) */
    add: (data: unknown) => (source = makeSource(data)),
    holdNext: () => (hold = true),
    release: () => {
      hold = false
      release?.()
    },
    /** MapLibre makes the source with this data again or anew, as after a change of the style, and fires `styledata` */
    remake: (data: unknown) => {
      source = makeSource(data)
      for (const handler of handlers.get('styledata') ?? []) handler()
    },
    listeners: (type: string) => handlers.get(type)?.size ?? 0,
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
    fake.add(holder.collection)
    holder.apply(fake.map, 's', [a, c])
    await tick()
    expect(fake.updates).toHaveLength(1)
    expect(fake.updates[0]!.add).toEqual([c])
    expect(fake.updates[0]!.remove).toEqual([b.id!])
    expect(holder.latest().features).toEqual([a, c])
  })

  test('the collection MapLibre was given keeps its features: MapLibre reads it again for the first update', async () => {
    const fake = fakeMap()
    const [a, b] = [point(1), point(2)]
    const holder = new Holder([a, b])
    const given = holder.collection
    const features = given.features
    holder.apply(fake.map, 's', [a])
    await tick()
    expect(holder.collection).toBe(given)
    expect(given.features).toBe(features)
    expect(given.features).toEqual([a, b])
    expect(Object.isFrozen(given)).toBe(true)
    // every whole collection is a new object
    expect(holder.latest()).not.toBe(holder.latest())
  })

  test('nothing goes out when nothing changed', async () => {
    const fake = fakeMap()
    const a = point(1)
    const holder = new Holder([a])
    fake.add(holder.collection)
    holder.apply(fake.map, 's', [a])
    await tick()
    expect(fake.updates).toHaveLength(0)
  })

  test('updates wait for the one in flight and go out together; a removal is never dropped', async () => {
    const fake = fakeMap()
    const [a, b, c] = [point(1), point(2), point(3)]
    const holder = new Holder([a])
    fake.add(holder.collection)
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

  test('removals need no whole collection afterwards', async () => {
    const fake = fakeMap()
    const [a, b] = [point(1), point(2)]
    const holder = new Holder([a, b])
    fake.add(holder.collection)
    holder.apply(fake.map, 's', [b])
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(fake.whole).toEqual([])
  })

  test('a source made again gets the whole latest collection, not a difference', async () => {
    const fake = fakeMap()
    const [a, b, c] = [point(1), point(2), point(3)]
    const holder = new Holder([a, b])
    fake.add(holder.collection)
    holder.apply(fake.map, 's', [a, c])
    await tick()
    fake.remake(holder.collection)
    await tick()
    expect(fake.whole).toHaveLength(1)
    expect(fake.whole[0]!.features).toEqual([a, c])
    expect(fake.whole[0]).not.toBe(holder.collection)
    // the next change goes out as a difference again
    holder.apply(fake.map, 's', [c])
    await tick()
    expect(fake.updates.at(-1)!.remove).toEqual([a.id!])
    expect(fake.whole).toHaveLength(1)
  })

  test('a source made from another collection gets the whole latest one first (a render React threw away)', async () => {
    const fake = fakeMap()
    const [a, b, c] = [point(1), point(2), point(3)]
    // the thrown-away render's Holder added the source; this one finds it
    const lost = new Holder([a, b])
    fake.add(lost.collection)
    const holder = new Holder([a, c])
    holder.apply(fake.map, 's', [a, c])
    await tick()
    expect(fake.updates).toHaveLength(0)
    expect(fake.whole.map((collection) => collection.features)).toEqual([[a, c]])
    // then differences
    holder.apply(fake.map, 's', [c])
    await tick()
    expect(fake.updates).toHaveLength(1)
    expect(fake.updates[0]!.remove).toEqual([a.id!])
  })

  test('a source made from this collection takes differences right away, also with changes made before it was there', async () => {
    const fake = fakeMap()
    const [a, b, c] = [point(1), point(2), point(3)]
    const holder = new Holder([a, b])
    holder.apply(fake.map, 's', [a, c]) // no source yet: kept
    await tick()
    expect(fake.updates).toHaveLength(0)
    fake.remake(holder.collection) // react-map-gl adds it now
    await tick()
    expect(fake.whole).toEqual([])
    expect(fake.updates).toHaveLength(1)
    expect(fake.updates[0]!.add).toEqual([c])
    expect(fake.updates[0]!.remove).toEqual([b.id!])
  })

  test('after dispose nothing more goes out and the map has no listener of it left', async () => {
    const fake = fakeMap()
    const [a, b] = [point(1), point(2)]
    const holder = new Holder([a, b])
    fake.add(holder.collection)
    holder.apply(fake.map, 's', [a])
    await tick()
    holder.dispose()
    fake.remake(holder.collection)
    await tick()
    expect(fake.whole).toEqual([])
    expect(fake.listeners('styledata')).toBe(0)
  })
})
