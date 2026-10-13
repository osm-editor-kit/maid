import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  ADDRESS_PLAQUE,
  buildLayers,
  iconImagesRequestedAt,
  type LayerOptions,
} from '@osm-editor-kit/maid-renderer'
import { installMarkerImages, markerImageState, parseMarkerImage, spriteOf, within } from './images'

const options: LayerOptions = {
  fill: 'full',
  labels: true,
  icons: true,
  pins: 'fit',
  lat: 52,
  dashes: new Map(),
  selectionOnly: false,
}
const layers = buildLayers(options)

describe('parseMarkerImage', () => {
  it('reads the pin, the bare icon and the plaque', () => {
    expect(parseMarkerImage('pin-maki-restaurant')).toEqual({
      kind: 'pin',
      icon: 'maki-restaurant',
    })
    expect(parseMarkerImage('pin-none')).toEqual({ kind: 'pin', icon: 'none' })
    expect(parseMarkerImage('icon-temaki-bus')).toEqual({ kind: 'icon', icon: 'temaki-bus' })
    expect(parseMarkerImage(ADDRESS_PLAQUE)).toEqual({ kind: 'plaque' })
  })

  it('leaves other images to their own handlers', () => {
    expect(parseMarkerImage('arrow-1-#444')).toBeUndefined()
    expect(parseMarkerImage('pinned')).toBeUndefined()
  })
})

describe('spriteOf', () => {
  it('finds the sprite file by the prefix of the icon', () => {
    expect(spriteOf('maki-restaurant')).toBe('maki')
    expect(spriteOf('temaki-bus')).toBe('temaki')
    expect(spriteOf('fas-parking')).toBe('fa')
    expect(spriteOf('far-clock')).toBe('fa')
    expect(spriteOf('iD-icon')).toBe('iD')
  })

  it('has no sprite for an unknown prefix, a name without a dash, or an inherited key', () => {
    expect(spriteOf('unknown-x')).toBeUndefined()
    expect(spriteOf('none')).toBeUndefined()
    expect(spriteOf('constructor-x')).toBeUndefined()
  })
})

describe('iconImagesRequestedAt (which icons a tile of a zoom asks for)', () => {
  it('asks for nothing below the detail zoom', () => {
    expect(iconImagesRequestedAt(layers, 14).size).toBe(0)
  })

  it('asks for the vertex icons at zoom 16, and for no pins yet', () => {
    // the pin of a hovered or selected point comes from its own small source, so the points source asks for none
    const at16 = iconImagesRequestedAt(layers, 16)
    expect(at16.has('pin-')).toBe(false)
    expect(at16.has('icon-')).toBe(true)
  })

  it('asks for the pins from zoom 17, where the pin layer is laid out (it draws from 17.5)', () => {
    expect(iconImagesRequestedAt(layers, 17).has('pin-')).toBe(true)
  })
})

describe('installMarkerImages', () => {
  it('installs one resolver and leaves ids that are not markers alone', async () => {
    let resolver: ((id: string) => Promise<void>) | undefined
    const added: string[] = []
    const fake = {
      setMissingStyleImageResolver(next: (id: string) => Promise<void>) {
        resolver = next
      },
      hasImage: () => false,
      addImage(id: string) {
        added.push(id)
      },
    }
    installMarkerImages(fake as never)
    expect(resolver).toBeDefined()
    await resolver!('arrow-1-#444')
    expect(added).toEqual([])
  })
})

describe('within', () => {
  it('settles with the value, or rejects with the limit when the work never settles', async () => {
    expect(await within(Promise.resolve(3), 50, 'quick')).toBe(3)
    expect(within(new Promise<void>(() => {}), 10, 'stuck')).rejects.toThrow(
      'stuck did not finish within 10 ms',
    )
  })

  it('passes a rejection through', async () => {
    expect(within(Promise.reject(new Error('boom')), 50, 'x')).rejects.toThrow('boom')
  })
})

// A fake browser for the marker images: an Image that loads, fails, never settles or loads late; a canvas that can throw
type ImageMode = 'load' | 'error' | 'never' | 'late'
let imageMode: ImageMode = 'load'
let imagesMade = 0
let canvasThrows = false

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(_width?: number, _height?: number) {
    imagesMade++
  }
  set src(_value: string) {
    if (imageMode === 'load') queueMicrotask(() => this.onload?.())
    else if (imageMode === 'error') queueMicrotask(() => this.onerror?.())
    else if (imageMode === 'late') setTimeout(() => this.onload?.(), 60)
  }
}

class FakePath2D {
  constructor(_path: string) {}
}

class FakeDOMParser {
  parseFromString(_text: string, _type: string) {
    return {
      getElementById: (id: string) =>
        id.startsWith('maki-')
          ? { getAttribute: () => '0 0 15 15', innerHTML: '<path d="M0 0"/>' }
          : null,
    }
  }
}

function fakeDocument() {
  return {
    createElement: () => {
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_target, name) =>
          name === 'getImageData'
            ? (_x: number, _y: number, w: number, h: number) => {
                if (canvasThrows) throw new Error('the canvas is gone')
                return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
              }
            : () => undefined,
        set: () => true,
      })
      return { width: 0, height: 0, getContext: () => ctx }
    },
  }
}

const fakeFetch = async (_url: string) => ({ text: async () => '<svg/>' })

const realGlobals = {
  Image: globalThis.Image,
  document: globalThis.document,
  Path2D: globalThis.Path2D,
  DOMParser: globalThis.DOMParser,
  fetch: globalThis.fetch,
}

beforeEach(() => {
  imageMode = 'load'
  imagesMade = 0
  canvasThrows = false
  Object.assign(globalThis as Record<string, unknown>, {
    Image: FakeImage,
    document: fakeDocument(),
    Path2D: FakePath2D,
    DOMParser: FakeDOMParser,
    fetch: fakeFetch,
  })
})

afterEach(() => {
  Object.assign(globalThis as Record<string, unknown>, realGlobals)
})

/** A map that records the images added to it. Each test uses its own ids: the caches are per module. */
function fakeMap(overrides: { hasImage?: (id: string) => boolean } = {}) {
  const added: string[] = []
  const have = new Set<string>()
  let resolver: ((id: string) => Promise<void>) | undefined
  const map = {
    setMissingStyleImageResolver(next: (id: string) => Promise<void>) {
      resolver = next
    },
    hasImage: overrides.hasImage ?? ((id: string) => have.has(id)),
    addImage(id: string) {
      have.add(id)
      added.push(id)
    },
  }
  return { map, added, ask: (id: string) => resolver!(id) }
}

describe('marker image resolver: every request settles', () => {
  it('a decode that never settles resolves through the limit, warns once, and is not asked again', async () => {
    imageMode = 'never'
    const warnings: string[] = []
    const { map, added, ask } = fakeMap()
    installMarkerImages(map as never, 2, { limitMs: 30, warn: (m) => warnings.push(m) })
    const started = performance.now()
    await ask('pin-maki-never')
    expect(performance.now() - started).toBeLessThan(1000)
    expect(added).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('pin-maki-never')
    const made = imagesMade
    await ask('pin-maki-never')
    expect(imagesMade).toBe(made)
    expect(warnings).toHaveLength(1)
    expect(markerImageState().failed.map((f) => f.id)).toContain('pin-maki-never')
  })

  it('an image that fails to load resolves, is not added, and is not asked again', async () => {
    imageMode = 'error'
    const warnings: string[] = []
    const { map, added, ask } = fakeMap()
    installMarkerImages(map as never, 2, { limitMs: 500, warn: (m) => warnings.push(m) })
    await ask('icon-maki-broken')
    expect(added).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('the image failed to load')
    const made = imagesMade
    await ask('icon-maki-broken')
    expect(imagesMade).toBe(made)
  })

  it('a synchronous throw resolves: a canvas that throws, and a map whose lookup throws', async () => {
    const warnings: string[] = []
    canvasThrows = true
    const first = fakeMap()
    installMarkerImages(first.map as never, 2, { limitMs: 500, warn: (m) => warnings.push(m) })
    expect(first.ask('pin-maki-throws')).resolves.toBeUndefined()
    expect(first.added).toEqual([])
    canvasThrows = false
    const second = fakeMap({
      hasImage: () => {
        throw new Error('the map is gone')
      },
    })
    installMarkerImages(second.map as never, 2, { limitMs: 500, warn: (m) => warnings.push(m) })
    expect(second.ask('pin-maki-lookup')).resolves.toBeUndefined()
    expect(warnings.join('\n')).toContain('the map is gone')
  })

  it('two requests for one image share one creation, and both settle', async () => {
    const { map, added, ask } = fakeMap()
    installMarkerImages(map as never, 2, { limitMs: 500, warn: () => {} })
    const made = imagesMade
    await Promise.all([ask('icon-maki-shared'), ask('icon-maki-shared')])
    expect(imagesMade - made).toBe(1)
    expect(added).toEqual(['icon-maki-shared'])
  })

  it('an image that arrives after the limit is not added behind MapLibre', async () => {
    imageMode = 'late'
    const { map, added, ask } = fakeMap()
    installMarkerImages(map as never, 2, { limitMs: 10, warn: () => {} })
    await ask('icon-maki-late')
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(added).toEqual([])
  })
})
