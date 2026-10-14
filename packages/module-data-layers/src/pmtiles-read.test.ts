import { describe, expect, test } from 'bun:test'
import type { RemoteFetch } from '@osm-editor-kit/maid-core'
import { pmtilesLayersOptions, readPmtilesLayers } from './pmtiles.ts'

const ARCHIVE = 'https://tiles.example.org/data.pmtiles'

/** A fake of the editor's fetch: answers every range with 127 zero bytes (not an archive), records the calls */
function recording() {
  const calls: { url: string; headers: unknown }[] = []
  const send: RemoteFetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers })
    return new Response(new Uint8Array(127), { status: 206 })
  }
  return { send, calls }
}

describe('reading a PMTiles archive', () => {
  test('every range is a request through the editor fetch, to the archive address', async () => {
    const { send, calls } = recording()
    const failure = await readPmtilesLayers(ARCHIVE, send).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((call) => call.url === ARCHIVE)).toBe(true)
    expect(calls[0]?.headers).toMatchObject({ Range: expect.stringMatching(/^bytes=0-/) })
  })

  test('the query of an archive is keyed by its address, not retried, and kept for the session', () => {
    const options = pmtilesLayersOptions(ARCHIVE, recording().send)
    expect([...options.queryKey]).toEqual(['data-layers', 'pmtiles-layers', ARCHIVE])
    expect(options.retry).toBe(false)
    expect(options.gcTime).toBe(Infinity)
  })
})
