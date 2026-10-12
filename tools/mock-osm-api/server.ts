/**
 * Local stand-in for the OSM API. Serves frozen fixtures so that no editor
 * needs to talk to OSM infrastructure (core rule 1).
 *
 *   bun tools/mock-osm-api/server.ts [--latency 50] [--port 8090]
 *
 * API root per scene: http://localhost:8090/s/<scene>
 *   /api/capabilities(.json)
 *   /api/0.6/map(.json)?bbox=w,s,e,n
 *   /api/0.6/notes.json?bbox=l,b,r,t&closed=0|-1&limit=N (notes of fixtures/notes/<scene>.json)
 *   /api/0.6/node/ID(.json), /api/0.6/{way,relation}/ID(/full)(.json)
 * Every write is rejected with 405. /requests returns a log of what was asked.
 */
import { join } from 'node:path'
import { SCENES } from '../fixtures/scenes'
import { PORTS } from '../ports'

type Node = { type: 'node'; id: number; lat: number; lon: number }
type Way = { type: 'way'; id: number; nodes: number[] }
type Relation = { type: 'relation'; id: number; members: { type: string; ref: number }[] }
type Element = Node | Way | Relation
/** A note as the notes API returns it: a GeoJSON point with its comments (fixtures/notes/<scene>.json) */
export type NoteFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { id: number; status: 'open' | 'closed'; [key: string]: unknown }
}

const CELL = 0.002 // degrees; index granularity for the bbox lookup

export class SceneIndex {
  nodes = new Map<number, Node>()
  ways = new Map<number, Way>()
  relations = new Map<number, Relation>()
  private grid = new Map<string, Node[]>()
  private nodeWays = new Map<number, number[]>()
  private memberRelations = new Map<string, number[]>()
  private cache = new Map<string, string>()

  constructor(
    elements: Element[],
    private readonly notes: NoteFeature[] = [],
  ) {
    for (const e of elements) {
      if (e.type === 'node') {
        this.nodes.set(e.id, e)
        const key = `${Math.floor(e.lon / CELL)}/${Math.floor(e.lat / CELL)}`
        const cell = this.grid.get(key)
        if (cell) cell.push(e)
        else this.grid.set(key, [e])
      } else if (e.type === 'way') {
        this.ways.set(e.id, e)
        for (const n of e.nodes) {
          const list = this.nodeWays.get(n)
          if (list) list.push(e.id)
          else this.nodeWays.set(n, [e.id])
        }
      } else {
        this.relations.set(e.id, e)
        for (const m of e.members) {
          const key = `${m.type[0]}${m.ref}`
          const list = this.memberRelations.get(key)
          if (list) list.push(e.id)
          else this.memberRelations.set(key, [e.id])
        }
      }
    }
  }

  /** Same contract as the real API: nodes in the box, their ways with all way nodes, and relations of both. */
  map(bbox: [number, number, number, number]) {
    const key = bbox.join(',')
    const cached = this.cache.get(key)
    if (cached) return cached
    const [w, s, e, n] = bbox
    const nodeIds = new Set<number>()
    const wayIds = new Set<number>()
    const relationIds = new Set<number>()
    for (let cx = Math.floor(w / CELL); cx <= Math.floor(e / CELL); cx++) {
      for (let cy = Math.floor(s / CELL); cy <= Math.floor(n / CELL); cy++) {
        for (const node of this.grid.get(`${cx}/${cy}`) ?? []) {
          if (node.lon >= w && node.lon <= e && node.lat >= s && node.lat <= n) nodeIds.add(node.id)
        }
      }
    }
    for (const id of nodeIds) {
      for (const wayId of this.nodeWays.get(id) ?? []) wayIds.add(wayId)
      for (const relId of this.memberRelations.get(`n${id}`) ?? []) relationIds.add(relId)
    }
    for (const id of wayIds) {
      for (const nodeId of this.ways.get(id)!.nodes) if (this.nodes.has(nodeId)) nodeIds.add(nodeId)
      for (const relId of this.memberRelations.get(`w${id}`) ?? []) relationIds.add(relId)
    }
    // a copy: the loop adds parent relations to the set it walks
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const id of [...relationIds]) {
      for (const relId of this.memberRelations.get(`r${id}`) ?? []) relationIds.add(relId)
    }
    const elements: Element[] = [
      ...[...nodeIds].map((id) => this.nodes.get(id)!),
      ...[...wayIds].map((id) => this.ways.get(id)!),
      ...[...relationIds].map((id) => this.relations.get(id)!),
    ]
    const body = JSON.stringify({
      version: '0.6',
      generator: 'maid mock-osm-api',
      copyright: 'OpenStreetMap and contributors',
      attribution: 'http://www.openstreetmap.org/copyright',
      license: 'http://opendatacommons.org/licenses/odbl/1-0/',
      bounds: { minlat: s, minlon: w, maxlat: n, maxlon: e },
      elements,
    })
    this.cache.set(key, body)
    return body
  }

  /**
   * The notes API's answer for a box: `closed` false is the API's `closed=0` (open notes only).
   * The fixture is frozen, so the API's "closed in the last N days" window is not applied: every
   * closed note of the fixture counts as recent. `limit` caps the list like the real API does.
   */
  notesIn(bbox: [number, number, number, number], closed: boolean, limit: number): string {
    const [w, s, e, n] = bbox
    const features: NoteFeature[] = []
    for (const note of this.notes) {
      if (features.length >= limit) break
      const [lon, lat] = note.geometry.coordinates
      if (lon < w || lon > e || lat < s || lat > n) continue
      if (!closed && note.properties.status !== 'open') continue
      features.push(note)
    }
    return JSON.stringify({ type: 'FeatureCollection', features })
  }

  /**
   * What `/api/0.6/{way,relation}/ID/full` answers, as the OSM API does: the way or relation, its
   * nodes (a way's nodes; a relation's node members and the nodes of its way members), its member
   * ways, and its member relations, one level only (not their members). Members that are not in
   * the fixture are left out; each element comes once.
   */
  full(type: 'way' | 'relation', id: number) {
    const root = type === 'way' ? this.ways.get(id) : this.relations.get(id)
    if (!root) return undefined
    const out: Element[] = []
    const seen = new Set<string>()
    const add = (element: Element | undefined) => {
      if (!element) return
      const key = `${element.type}${element.id}`
      if (seen.has(key)) return
      seen.add(key)
      out.push(element)
    }
    const addWay = (way: Way) => {
      for (const n of way.nodes) add(this.nodes.get(n))
      add(way)
    }
    if (root.type === 'way') addWay(root)
    else {
      for (const m of root.members) {
        if (m.type === 'node') add(this.nodes.get(m.ref))
        else if (m.type === 'way' && this.ways.has(m.ref)) addWay(this.ways.get(m.ref)!)
        else if (m.type === 'relation') add(this.relations.get(m.ref))
      }
      add(root)
    }
    return JSON.stringify({ version: '0.6', generator: 'maid mock-osm-api', elements: out })
  }
}

const CAPABILITIES = {
  version: '0.6',
  generator: 'maid mock-osm-api',
  api: {
    version: { minimum: '0.6', maximum: '0.6' },
    area: { maximum: 0.25 },
    note_area: { maximum: 25 },
    tracepoints: { per_page: 5000 },
    waynodes: { maximum: 2000 },
    relationmembers: { maximum: 32000 },
    changesets: { maximum_elements: 10000, default_query_limit: 100, maximum_query_limit: 100 },
    notes: { default_query_limit: 100, maximum_query_limit: 10000 },
    timeout: { seconds: 300 },
    status: { database: 'online', api: 'online', gpx: 'online' },
  },
  policy: { imagery: { blacklist: [] } },
}

const CAPABILITIES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="maid mock-osm-api">
  <api>
    <version minimum="0.6" maximum="0.6"/>
    <area maximum="0.25"/>
    <note_area maximum="25"/>
    <tracepoints per_page="5000"/>
    <waynodes maximum="2000"/>
    <relationmembers maximum="32000"/>
    <changesets maximum_elements="10000" default_query_limit="100" maximum_query_limit="100"/>
    <notes default_query_limit="100" maximum_query_limit="10000"/>
    <timeout seconds="300"/>
    <status database="online" api="online" gpx="online"/>
  </api>
  <policy><imagery/></policy>
</osm>`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }

export async function loadScenes(names = SCENES.map((s) => s.name)) {
  const scenes = new Map<string, SceneIndex>()
  for (const name of names) {
    const gz = await Bun.file(join(import.meta.dir, `../../fixtures/${name}.json.gz`)).arrayBuffer()
    const json = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(gz))))
    // notes are optional: a scene without fixtures/notes/<name>.json has none
    const notesFile = Bun.file(join(import.meta.dir, `../../fixtures/notes/${name}.json`))
    const notes: NoteFeature[] = (await notesFile.exists()) ? (await notesFile.json()).features : []
    scenes.set(name, new SceneIndex(json.elements, notes))
  }
  return scenes
}

export function createHandler(scenes: Map<string, SceneIndex>, options: { latency: number }) {
  const log: { t: number; method: string; path: string; status: number }[] = []
  const respond = async (req: Request) => {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (url.pathname === '/requests') return Response.json(log, { headers: CORS })
    if (url.pathname === '/requests/reset') {
      log.length = 0
      return Response.json({ ok: true }, { headers: CORS })
    }
    if (url.pathname === '/scenes') {
      return Response.json(
        SCENES.filter((s) => scenes.has(s.name)),
        { headers: CORS },
      )
    }
    const match = url.pathname.match(/^\/s\/([^/]+)(\/.*)$/)
    if (!match) return new Response('Not found', { status: 404, headers: CORS })
    const scene = scenes.get(match[1]!)
    const path = match[2]!.replace(/\.json$/, '')
    // notes of an unknown scene, or of a scene without notes, are an empty collection
    if (!scene && path !== '/api/0.6/notes')
      return new Response('Unknown scene', { status: 404, headers: CORS })
    if (req.method !== 'GET') {
      return new Response('The mock OSM API is read-only', { status: 405, headers: CORS })
    }
    const wantsXml = !match[2]!.endsWith('.json') && !req.headers.get('accept')?.includes('json')
    if (options.latency) await Bun.sleep(options.latency)

    if (path === '/api/0.6/notes') {
      const bbox = url.searchParams.get('bbox')?.split(',').map(Number)
      if (bbox?.length !== 4 || bbox.some(Number.isNaN))
        return new Response('Bad bbox', { status: 400, headers: CORS })
      // closed=0 asks for open notes only; any other value (the API default is 7 days) gives closed too
      const closed = url.searchParams.get('closed') !== '0'
      const requested = Number(url.searchParams.get('limit') ?? 100)
      const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 10000) : 100
      const box = bbox as [number, number, number, number]
      const body = scene
        ? scene.notesIn(box, closed, limit)
        : JSON.stringify({ type: 'FeatureCollection', features: [] })
      return new Response(body, { headers: JSON_HEADERS })
    }
    if (!scene) return new Response('Unknown scene', { status: 404, headers: CORS })

    if (path === '/api/capabilities' || path === '/api/0.6/capabilities') {
      if (wantsXml)
        return new Response(CAPABILITIES_XML, {
          headers: { ...CORS, 'Content-Type': 'application/xml' },
        })
      return Response.json(CAPABILITIES, { headers: CORS })
    }
    if (path === '/api/0.6/map') {
      const bbox = url.searchParams.get('bbox')?.split(',').map(Number)
      if (bbox?.length !== 4 || bbox.some(Number.isNaN))
        return new Response('Bad bbox', { status: 400, headers: CORS })
      return new Response(scene.map(bbox as [number, number, number, number]), {
        headers: JSON_HEADERS,
      })
    }
    const entity = path.match(/^\/api\/0\.6\/(node|way|relation)\/(\d+)(\/full)?$/)
    if (entity) {
      const id = Number(entity[2])
      const type = entity[1] as 'node' | 'way' | 'relation'
      let body: string | undefined
      if (type !== 'node' && entity[3]) body = scene.full(type, id)
      else {
        const found =
          type === 'node'
            ? scene.nodes.get(id)
            : type === 'way'
              ? scene.ways.get(id)
              : scene.relations.get(id)
        if (found) body = JSON.stringify({ version: '0.6', elements: [found] })
      }
      if (!body) return new Response('Not found', { status: 404, headers: CORS })
      return new Response(body, { headers: JSON_HEADERS })
    }
    if (path === '/api/0.6/user/details')
      return new Response('Unauthorized', { status: 401, headers: CORS })
    if (path === '/api/0.6/notes/search') {
      return Response.json({ type: 'FeatureCollection', features: [] }, { headers: CORS })
    }
    if (path === '/api/0.6/changesets')
      return Response.json({ version: '0.6', changesets: [] }, { headers: CORS })
    return new Response('Not found', { status: 404, headers: CORS })
  }
  return async (req: Request) => {
    const res = await respond(req)
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/requests')) {
      log.push({
        t: Date.now(),
        method: req.method,
        path: url.pathname + url.search,
        status: res.status,
      })
    }
    return res
  }
}

if (import.meta.main) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > -1 ? process.argv[i + 1] : undefined
  }
  const port = Number(arg('port') ?? PORTS.mockApi)
  const latency = Number(arg('latency') ?? 0)
  const scenes = await loadScenes()
  Bun.serve({ port, hostname: '127.0.0.1', fetch: createHandler(scenes, { latency }) })
  console.log(
    `mock-osm-api on http://localhost:${port} (scenes: ${[...scenes.keys()].join(', ')}, latency ${latency}ms)`,
  )
}
