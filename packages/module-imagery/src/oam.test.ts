import { describe, expect, it } from 'bun:test'
import { HttpError, type RemoteFetch } from '@osm-editor-kit/maid-core'
import { areaText, oamRows, resolutionText } from './oam-rows.ts'
import { drawOam, listOam, OAM_MIN_ZOOM, setOamFetch } from './oam.ts'
import { NONE, oamValue } from './url.ts'

/** Item 1e7cb303 as the API gave it on 2026-10-25, cut to what the rows read */
const ITEM = {
  id: '1e7cb303-0c37-4904-81bf-374640b500af',
  collection: 'openaerialmap',
  bbox: [7.404381675568253, 48.43728034594524, 7.4060471713065, 48.438321228139294],
  properties: {
    title: 'Mont Sainte-Odile Abbey – selected footways – street-level 360 ortho',
    datetime: '2026-10-24T00:00:00Z',
    gsd: 0.045,
    license: 'CC-BY-4.0',
    providers: [{ name: 'OSM Verkehrswende' }],
    'oam:platform_type': 'uav',
    'oam:footprint_area': 6637.947274894977,
    renders: { browse: { bidx: [1, 2, 3], assets: ['visual'] } },
  },
  assets: {
    visual: {
      href: 'https://example.org/cog.tif',
      type: 'image/tiff; application=geotiff; profile=cloud-optimized',
      roles: ['data'],
    },
    thumbnail: {
      href: 'https://example.org/thumbnail.png',
      type: 'image/png',
      roles: ['thumbnail'],
    },
  },
}
const ITEM_URL = `https://api.imagery.hotosm.org/stac/collections/openaerialmap/items/${ITEM.id}`
const VALUE = oamValue(ITEM.id)

/** A stub editor fetch: answers from a table of URLs, throws the editor's HttpError for the rest, counts the requests */
function stubFetch(answers: Record<string, unknown>) {
  const asked: string[] = []
  const fetch: RemoteFetch = async (url) => {
    const href = String(url)
    asked.push(href)
    if (!(href in answers)) throw new HttpError(404, href)
    return new Response(JSON.stringify(answers[href]), {
      headers: { 'Content-Type': 'application/geo+json' },
    })
  }
  setOamFetch(() => fetch)
  return asked
}

describe('listOam: the images in a view', () => {
  it('asks nothing below zoom 12', async () => {
    const asked = stubFetch({})
    expect(await listOam({ bounds: [7.39, 48.43, 7.42, 48.44], zoom: OAM_MIN_ZOOM - 0.1 })).toEqual(
      [],
    )
    expect(asked).toEqual([])
  })

  it('asks the search once for the view and reads the images', async () => {
    const search =
      'https://api.imagery.hotosm.org/stac/search?collections=openaerialmap&bbox=7.39%2C48.43%2C7.42%2C48.44&limit=50&sortby=-properties.datetime'
    const asked = stubFetch({ [search]: { type: 'FeatureCollection', features: [ITEM] } })
    const layers = await listOam({ bounds: [7.39, 48.43, 7.42, 48.44], zoom: 16 })
    expect(asked).toEqual([search])
    expect(layers.map((layer) => layer.id)).toEqual([VALUE])
  })
})

describe('drawOam: one image for the map', () => {
  it('draws the image with its tiles, bounds and the imagery_used name', async () => {
    stubFetch({ [ITEM_URL]: ITEM })
    const drawn = (await drawOam(VALUE, true))!
    expect(drawn.id).toBe(VALUE)
    expect(drawn.name).toBe(
      'OpenAerialMap (Mont Sainte-Odile Abbey – selected footways – street-level 360 ortho)',
    )
    expect(drawn.sourceId).toBe(`oam-${ITEM.id}`)
    expect(drawn.source.tiles[0]).toBe(
      `https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/${ITEM.id}/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&bidx=1&bidx=2&bidx=3`,
    )
    expect(drawn.source.bounds).toEqual(ITEM.bbox as [number, number, number, number])
    expect(drawn.layer.source).toBe(drawn.sourceId)
    expect(drawn.background).toBe(true)
    expect(drawn.oam?.oam.provider).toBe('OSM Verkehrswende')
  })

  it('draws nothing for an image the API does not know (the editor fetch throws a 404)', async () => {
    stubFetch({})
    expect(await drawOam(oamValue('missing'), true)).toBeUndefined()
  })
})

describe('the rows of the panel', () => {
  it('shows the facts of an image, and lists the shown one first when it is out of view', async () => {
    const search =
      'https://api.imagery.hotosm.org/stac/search?collections=openaerialmap&bbox=7.39%2C48.43%2C7.42%2C48.44&limit=50&sortby=-properties.datetime'
    stubFetch({ [search]: { features: [ITEM] }, [ITEM_URL]: ITEM })
    const [layer] = await listOam({ bounds: [7.39, 48.43, 7.42, 48.44], zoom: 16 })
    const [row] = oamRows([layer!], undefined, VALUE, '')
    expect(row).toMatchObject({
      id: VALUE,
      date: '2026-10-24',
      provider: 'OSM Verkehrswende',
      platform: 'uav',
      resolution: '4.5 cm/px',
      area: '6,638 m²',
      thumbnailUrl: 'https://example.org/thumbnail.png',
      selected: true,
    })
    expect(row!.links.map((link) => link.label)).toEqual(['Attribution', 'License'])
    // out of view: the shown image is still listed, first
    expect(oamRows([], layer, VALUE, '').map((r) => r.id)).toEqual([VALUE])
    expect(oamRows([layer!], layer, NONE, '')).toHaveLength(1)
  })

  it('searches the name, the provider and the date', async () => {
    const search =
      'https://api.imagery.hotosm.org/stac/search?collections=openaerialmap&bbox=7.39%2C48.43%2C7.42%2C48.44&limit=50&sortby=-properties.datetime'
    stubFetch({ [search]: { features: [ITEM] } })
    const layers = await listOam({ bounds: [7.39, 48.43, 7.42, 48.44], zoom: 16 })
    expect(oamRows(layers, undefined, NONE, 'verkehrswende 2026-10')).toHaveLength(1)
    expect(oamRows(layers, undefined, NONE, 'odile')).toHaveLength(1)
    expect(oamRows(layers, undefined, NONE, 'berlin')).toHaveLength(0)
  })

  it('writes resolution and area for people', () => {
    expect(resolutionText(0.045)).toBe('4.5 cm/px')
    expect(resolutionText(0.3)).toBe('30 cm/px')
    expect(resolutionText(1.25)).toBe('1.3 m/px')
    expect(resolutionText(undefined)).toBeUndefined()
    expect(areaText(6637.9)).toBe('6,638 m²')
    expect(areaText(1_440_000)).toBe('1.4 km²')
    expect(areaText(0)).toBeUndefined()
  })
})
