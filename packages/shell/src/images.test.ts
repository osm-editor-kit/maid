import { describe, expect, it } from 'bun:test'
import {
  ADDRESS_PLAQUE,
  buildLayers,
  iconImagesRequestedAt,
  type LayerOptions,
} from '@osm-editor-kit/maid-renderer'
import { installMarkerImages, parseMarkerImage, spriteOf } from './images'

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
