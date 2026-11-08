// The preview of a route from Postpass (https://github.com/woodpeck/postpass): SQL over HTTP on an osm2pgsql
// import of the planet. One query brings a relation, its sub-relations (a superroute's stages) and, for every way and
// node member, the tags and a simplified geometry. Plain data, no fetch: the shell sends the query
// (route-overview/preview-store.ts) and this file only writes the SQL and reads the answer.
//
// What the import has (postpass-ops SCHEMA.md and postpass.lua): `planet_osm_rels` every relation with its members
// (jsonb `[{type: 'N'|'W'|'R', ref, role}]`) and tags; `planet_osm_ways` the node ids of every way; `postpass_line`,
// `postpass_polygon`, `postpass_point` the geometry of tagged ways and nodes. An untagged way or node has no geometry
// there, so it stays a member without a shape.

import type { LonLat, MemberType, RouteMember } from '../types.ts'

/** About 5 m at the equator: enough for a diagram and a thin line on the map, a fraction of the coordinates */
export const PREVIEW_SIMPLIFY_DEGREES = 0.00005
/** Sub-relations followed below the asked relation: a superroute's stages and their sub-routes */
export const PREVIEW_DEPTH = 2

/** A relation of the preview: the asked one or one of its sub-relations */
export type PreviewRelation = {
  id: string
  tags: Readonly<Record<string, string>>
  members: readonly RouteMember[]
}

/** A way member of a relation of the preview */
export type PreviewWay = {
  id: string
  tags: Readonly<Record<string, string>>
  /** First and last node id (`n1`), so the preview chains with loaded ways that share an end */
  ends?: readonly [string, string]
  /** Simplified, in drawing order. Missing for an untagged way, which Postpass has no geometry for. */
  line?: readonly LonLat[]
  /** Length in metres of the full geometry, from Postpass */
  length?: number
}

/** A node member of a relation of the preview (tagged nodes only) */
export type PreviewNode = { id: string; tags: Readonly<Record<string, string>>; at: LonLat }

export type RoutePreview = {
  /** The relation that was asked for, `r123` */
  root: string
  /** State of the OSM data in Postpass (ISO time) */
  timestamp: string
  relations: ReadonlyMap<string, PreviewRelation>
  ways: ReadonlyMap<string, PreviewWay>
  nodes: ReadonlyMap<string, PreviewNode>
}

const LETTER_TYPES: Record<string, MemberType> = { N: 'node', W: 'way', R: 'relation' }
const TYPE_PREFIX: Record<MemberType, string> = { node: 'n', way: 'w', relation: 'r' }

/** The OSM number of a relation id (`r123` or `123`), or an error: only a validated number goes into the SQL */
export function relationNumber(id: string): number {
  const number = Number(/^r?(\d+)$/.exec(id)?.[1])
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`Not a relation id: ${id}`)
  return number
}

/**
 * The query of a relation's preview. Answers rows of three kinds (`k`): `R` a relation with its tags and members,
 * `W` a way with its tags, end nodes, length and simplified line as GeoJSON text, `N` a tagged node with its point.
 * Ask it with `options[geojson]=false`: the geometry is a column of text, not the answer's shape.
 *
 * The mock API (tools/mock-osm-api) finds the relation by the `-- maid:route-preview <id>` line.
 */
export function routePreviewSql(id: string): string {
  const number = relationNumber(id)
  return `-- maid:route-preview ${number}
WITH RECURSIVE tree(id, depth) AS (
  SELECT ${number}::bigint, 0
  UNION
  SELECT (m->>'ref')::bigint, tree.depth + 1
  FROM tree
  JOIN planet_osm_rels r ON r.id = tree.id
  CROSS JOIN jsonb_array_elements(r.members) m
  WHERE m->>'type' = 'R' AND tree.depth < ${PREVIEW_DEPTH}
),
rels AS (
  SELECT r.id, r.tags, r.members FROM planet_osm_rels r WHERE r.id IN (SELECT id FROM tree)
),
refs AS (
  SELECT DISTINCT m->>'type' AS t, (m->>'ref')::bigint AS ref
  FROM rels CROSS JOIN jsonb_array_elements(rels.members) m
  WHERE m->>'type' IN ('N', 'W')
)
SELECT 'R' AS k, id, tags, members, NULL::bigint AS first, NULL::bigint AS last,
  NULL::double precision AS length_m, NULL::text AS geom
FROM rels
UNION ALL
SELECT 'W', w.id, w.tags, NULL, w.nodes[1], w.nodes[array_length(w.nodes, 1)], g.length_m,
  ST_AsGeoJSON(ST_SimplifyPreserveTopology(
    CASE WHEN ST_Dimension(g.geom) = 2 THEN ST_Boundary(g.geom) ELSE g.geom END,
    ${PREVIEW_SIMPLIFY_DEGREES}), 6)
FROM refs
JOIN planet_osm_ways w ON refs.t = 'W' AND w.id = refs.ref
LEFT JOIN postpass_linepolygon g ON g.osm_type = 'W' AND g.osm_id = w.id
UNION ALL
SELECT 'N', p.osm_id, p.tags, NULL, NULL, NULL, NULL, ST_AsGeoJSON(p.geom, 6)
FROM refs
JOIN postpass_point p ON refs.t = 'N' AND p.osm_type = 'N' AND p.osm_id = refs.ref`
}

/** The answer did not have the shape the preview reads */
export class PreviewFormatError extends Error {
  constructor(
    message: string,
    /** The answer was fine but had no such relation: new since Postpass's last update, or deleted */
    readonly missing = false,
  ) {
    super(message)
    this.name = 'PreviewFormatError'
  }
}

type Row = Record<string, unknown>

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Tags as Postpass sends them: an object of strings, or null for none. Other values are dropped. */
function tagsOf(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const tags: Record<string, string> = {}
  for (const [key, text] of Object.entries(value)) if (typeof text === 'string') tags[key] = text
  return tags
}

function idOf(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) ? number : undefined
}

function membersOf(value: unknown): RouteMember[] {
  const list = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(list)) return []
  const members: RouteMember[] = []
  for (const item of list) {
    if (!isRecord(item)) continue
    const type = LETTER_TYPES[String(item.type)]
    const ref = idOf(item.ref)
    if (!type || ref === undefined) continue
    members.push({
      type,
      id: `${TYPE_PREFIX[type]}${ref}`,
      role: typeof item.role === 'string' ? item.role : '',
    })
  }
  return members
}

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

/** The geometry text of a row as positions: a line, the longest part of a multi-line, a point as one position */
function positionsOf(value: unknown): LonLat[] | undefined {
  if (typeof value !== 'string') return undefined
  let geometry: unknown
  try {
    geometry = JSON.parse(value)
  } catch {
    return undefined
  }
  if (!isRecord(geometry)) return undefined
  const { type, coordinates } = geometry
  const line = (list: unknown) =>
    Array.isArray(list) ? list.filter(isPosition).map(([lon, lat]) => [lon, lat] as const) : []
  if (type === 'Point')
    return isPosition(coordinates) ? [[coordinates[0], coordinates[1]]] : undefined
  if (type === 'LineString') return line(coordinates)
  if (type === 'MultiLineString' && Array.isArray(coordinates)) {
    // a way's line is one part; a multi-line comes from a polygon's outline with holes: the outer ring is longest
    let longest: LonLat[] = []
    for (const part of coordinates) {
      const positions = line(part)
      if (positions.length > longest.length) longest = positions
    }
    return longest
  }
  return undefined
}

/**
 * Reads Postpass's answer to `routePreviewSql` (`{ postpass_properties: { timestamp }, result: rows }`). Throws a
 * `PreviewFormatError` when it is not that shape, or when the asked relation is not in it (deleted, or a typo).
 */
export function parseRoutePreview(id: string, text: string): RoutePreview {
  const root = `r${relationNumber(id)}`
  let answer: unknown
  try {
    answer = JSON.parse(text)
  } catch {
    throw new PreviewFormatError('The answer is not JSON')
  }
  if (!isRecord(answer) || !Array.isArray(answer.result)) {
    throw new PreviewFormatError('The answer has no result rows')
  }
  const properties = isRecord(answer.postpass_properties) ? answer.postpass_properties : {}
  const timestamp = typeof properties.timestamp === 'string' ? properties.timestamp : ''
  const relations = new Map<string, PreviewRelation>()
  const ways = new Map<string, PreviewWay>()
  const nodes = new Map<string, PreviewNode>()
  for (const row of answer.result) {
    if (!isRecord(row)) continue
    const number = idOf(row.id)
    if (number === undefined) continue
    const tags = tagsOf(row.tags)
    if (row.k === 'R') {
      const relationId = `r${number}`
      relations.set(relationId, { id: relationId, tags, members: membersOf(row.members) })
    } else if (row.k === 'W') {
      const wayId = `w${number}`
      const first = idOf(row.first)
      const last = idOf(row.last)
      const line = positionsOf(row.geom)
      const length = typeof row.length_m === 'number' ? row.length_m : undefined
      ways.set(wayId, {
        id: wayId,
        tags,
        ...(first !== undefined && last !== undefined
          ? { ends: [`n${first}`, `n${last}`] as const }
          : {}),
        ...(line && line.length >= 2 ? { line } : {}),
        ...(length !== undefined ? { length } : {}),
      })
    } else if (row.k === 'N') {
      const at = positionsOf(row.geom)?.[0]
      if (at) nodes.set(`n${number}`, { id: `n${number}`, tags, at })
    }
  }
  if (!relations.has(root))
    throw new PreviewFormatError(`Relation ${root} is not in the answer`, true)
  return { root, timestamp, relations, ways, nodes }
}
