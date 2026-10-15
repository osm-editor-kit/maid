import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { parseBuildArgs } from './build'
import { getScene, SCENES } from './scenes'

const FIXTURES = join(import.meta.dir, '../../fixtures')
const ATTRIBUTION = '© OpenStreetMap contributors, ODbL 1.0'

async function readFixture(name: string) {
  const gz = await Bun.file(join(FIXTURES, `${name}.json.gz`)).arrayBuffer()
  const text = new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(gz)))
  return { text, json: JSON.parse(text) as { elements: { type: string }[] } }
}

describe('scenes', () => {
  test('names are unique, each box is valid and each centre lies inside its box', () => {
    expect(new Set(SCENES.map((s) => s.name)).size).toBe(SCENES.length)
    for (const scene of SCENES) {
      const [w, s, e, n] = scene.bbox
      expect(w).toBeLessThan(e)
      expect(s).toBeLessThan(n)
      const [lon, lat] = scene.center
      expect(lon).toBeGreaterThanOrEqual(w)
      expect(lon).toBeLessThanOrEqual(e)
      expect(lat).toBeGreaterThanOrEqual(s)
      expect(lat).toBeLessThanOrEqual(n)
    }
  })

  test('an unknown scene name is an error that lists the known names', () => {
    expect(() => getScene('nowhere')).toThrow('relations')
  })
})

describe('fixture files', () => {
  for (const scene of SCENES) {
    test(`${scene.name}: meta matches its scene, its counts and the sha256 of the JSON`, async () => {
      const meta = await Bun.file(join(FIXTURES, `${scene.name}.meta.json`)).json()
      expect(meta).toMatchObject({
        name: scene.name,
        description: scene.description,
        bbox: scene.bbox,
        center: scene.center,
        attribution: ATTRIBUTION,
      })
      // small, medium and dense were cut before the build wrote the zoom: compare it only where it is there
      if (meta.zoom !== undefined) expect(meta.zoom).toBe(scene.zoom)
      const { text, json } = await readFixture(scene.name)
      const counts = { node: 0, way: 0, relation: 0 }
      for (const e of json.elements) counts[e.type as keyof typeof counts]++
      expect(meta.counts).toEqual(counts)
      expect(meta.sha256).toBe(new Bun.CryptoHasher('sha256').update(text).digest('hex'))
    })
  }
})

describe('parseBuildArgs', () => {
  test('without --scene every scene is built; the first argument is the extract', () => {
    expect(parseBuildArgs(['/x/extract.osm.pbf'])).toEqual({
      source: '/x/extract.osm.pbf',
      scenes: SCENES,
    })
  })

  test('--scene picks the named scenes, repeatable or comma separated, without repeats', () => {
    const { source, scenes } = parseBuildArgs([
      '/x/extract.osm.pbf',
      '--scene',
      'relations',
      '--scene=small,relations',
    ])
    expect(source).toBe('/x/extract.osm.pbf')
    expect(scenes.map((s) => s.name)).toEqual(['relations', 'small'])
  })

  test('an unknown scene, an unknown option or a --scene without a name throws', () => {
    expect(() => parseBuildArgs(['a.pbf', '--scene', 'nope'])).toThrow('Unknown scene')
    expect(() => parseBuildArgs(['a.pbf', '--all'])).toThrow('Unknown option --all')
    expect(() => parseBuildArgs(['a.pbf', '--scene'])).toThrow('--scene needs a scene name')
  })
})
