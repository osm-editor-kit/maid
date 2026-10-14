import { describe, expect, test } from 'bun:test'
import type { RemoteFetch } from '@osm-editor-kit/maid-core'
import type { DataLayerConfig, FileLayer } from './config.ts'
import { layersOf } from './layers.ts'
import { linkedLayerOptions, linkMayLoad, loadLinkedLayer } from './link.ts'
import { linkedLayerId } from './url.ts'

const URL_OF = 'https://example.org/data/bike-parking.geojson'
const COLOR = '#d6007a'
const EMPTY = '{"type":"FeatureCollection","features":[]}'

/** A stub editor fetch that counts the requests and answers with `respond` */
function stub(respond: () => Promise<Response> | Response) {
  const urls: string[] = []
  const send: RemoteFetch = async (url) => {
    urls.push(String(url))
    return respond()
  }
  return { send, urls }
}

/** The error a promise rejects with, or undefined when it resolves */
function failureOf(promise: Promise<unknown>): Promise<Error | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
  )
}

describe('when a link may load its layer', () => {
  test('under automation nothing is loaded from a link, whatever the address', () => {
    expect(linkMayLoad(URL_OF, true)).toBe(false)
    expect(linkMayLoad('/data/a.geojson', true)).toBe(false)
  })

  test('a person’s browser loads a linked address, and no URL means no layer', () => {
    expect(linkMayLoad(URL_OF, false)).toBe(true)
    expect(linkMayLoad(null, false)).toBe(false)
    expect(linkMayLoad('', false)).toBe(false)
  })
})

describe('loading the layer of a link, through the add path', () => {
  test('one request, and the layer keeps the id of its address and the name of its file', async () => {
    const { send, urls } = stub(() => new Response(EMPTY))
    const layer = await loadLinkedLayer(URL_OF, send, COLOR)
    expect(urls).toEqual([URL_OF])
    expect(layer).toMatchObject({
      id: linkedLayerId(URL_OF),
      name: 'bike-parking',
      kind: 'geojson',
      url: URL_OF,
      color: COLOR,
    })
  })

  test('an address that does not answer gives the reason in plain words', async () => {
    // the editor's fetch answers a non-2xx status with a response that has it
    const { send } = stub(() => new Response(null, { status: 404 }))
    const failure = await failureOf(loadLinkedLayer(URL_OF, send, COLOR))
    expect(failure?.message).toBe('The server answered 404.')
  })

  test('an answer that is not GeoJSON is refused, and the layer is not made', async () => {
    const { send } = stub(() => new Response('<html></html>'))
    expect(await failureOf(loadLinkedLayer(URL_OF, send, COLOR))).toBeInstanceOf(Error)
  })

  test('the query of an address is kept for the session, one per address', () => {
    const options = linkedLayerOptions(URL_OF, stub(() => new Response(EMPTY)).send, COLOR)
    expect([...options.queryKey]).toEqual(['data-layers', 'link', URL_OF])
    expect(options.staleTime).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('a link adds exactly one layer, and nothing is stored for it', () => {
  const config: DataLayerConfig[] = [
    { id: 'c1', name: 'Config', kind: 'geojson', url: 'https://a.org/x.geojson', color: '#ff7a00' },
  ]
  const added: DataLayerConfig[] = [
    {
      id: 'user-1',
      name: 'Added',
      kind: 'geojson',
      url: 'https://b.org/y.geojson',
      color: '#7bc31a',
    },
  ]
  const files: FileLayer[] = []

  test('the link is one more layer, after the added ones, with its own origin', async () => {
    const { send } = stub(() => new Response(EMPTY))
    const linked = await loadLinkedLayer(URL_OF, send, COLOR)
    const listed = layersOf(config, added, files, [linked])
    expect(listed.map((layer) => [layer.id, layer.origin])).toEqual([
      ['c1', 'config'],
      ['user-1', 'added'],
      [linkedLayerId(URL_OF), 'link'],
    ])
    expect(listed).toHaveLength(config.length + added.length + 1)
  })

  test('without a link nothing is added, and a link never takes the stored list', () => {
    expect(layersOf(config, added, files).map((layer) => layer.origin)).toEqual(['config', 'added'])
    // the stored list is the input as it is: a link is a separate argument, never pushed into it
    expect(added).toHaveLength(1)
  })
})
