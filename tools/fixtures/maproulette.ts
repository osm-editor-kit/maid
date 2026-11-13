import { join } from 'node:path'
/**
 * The made-up MapRoulette challenges on the `small` scene, for the mock's MapRoulette API (tools/mock-osm-api) and the
 * checks of Maid MapRoulette. Three challenges, each with tasks on real ways of the scene:
 *
 * - 9001 "Footways without surface": a normal challenge, one footway per task, with instructions in Markdown and a
 *   `{{name}}` from the task's properties;
 * - 9002 "Service roads: surface=asphalt?": a tag fix (cooperative) challenge, one `setTags` suggestion per task;
 * - 9003 "Steps without handrail": a small normal challenge, so the list of challenges nearby has more than two rows.
 *
 * Not MapRoulette data: written here from the scene's ways, so it needs no request (core rule 1). The output is fixed
 * for a fixed scene (no randomness), so a rerun gives the same files.
 *
 * Usage: bun run fixtures-maproulette   (writes fixtures/maproulette/challenges.json and tasks.json)
 */
import { gunzipSync } from 'node:zlib'

type Tags = Record<string, string>
type OsmElement =
  | { type: 'node'; id: number; lat: number; lon: number; tags?: Tags }
  | { type: 'way'; id: number; nodes: number[]; tags?: Tags }

const ROOT = join(import.meta.dir, '../..')
const OUT = join(ROOT, 'fixtures/maproulette')
const MAPPED_ON = '2026-11-01T10:00:00Z'

async function scene() {
  const bytes = await Bun.file(join(ROOT, 'fixtures/small.json.gz')).arrayBuffer()
  const data = JSON.parse(gunzipSync(new Uint8Array(bytes)).toString('utf8')) as {
    elements: OsmElement[]
  }
  const nodes = new Map<number, [number, number]>()
  const ways: Extract<OsmElement, { type: 'way' }>[] = []
  for (const element of data.elements) {
    if (element.type === 'node') nodes.set(element.id, [element.lon, element.lat])
    else if (element.type === 'way') ways.push(element)
  }
  return { nodes, ways: ways.toSorted((a, b) => a.id - b.id) }
}

const round = (value: number) => Math.round(value * 1e7) / 1e7

function challenge(
  id: number,
  name: string,
  fields: { description: string; instruction: string; checkinComment: string; tagFix?: boolean },
) {
  return {
    id,
    name,
    description: fields.description,
    instruction: fields.instruction,
    checkinComment: fields.checkinComment,
    checkinSource: 'survey;Bing',
    blurb: fields.description.split('\n')[0],
    enabled: true,
    deleted: false,
    difficulty: 1,
    parent: 900,
    // MapRoulette's challenge type: 1 a normal challenge; the cooperative type is set per task (cooperativeWork)
    challengeType: 1,
    cooperativeType: fields.tagFix ? 1 : 0,
    owner: 1,
    status: 3,
    defaultPriority: 0,
    location: { type: 'Point', coordinates: [13.4, 52.389] },
  }
}

async function build() {
  const { nodes, ways } = await scene()
  const lineOf = (way: { nodes: number[] }) =>
    way.nodes.flatMap((id) => {
      const point = nodes.get(id)
      return point ? [[round(point[0]), round(point[1])]] : []
    })
  const middle = (line: number[][]) => {
    const point = line[Math.floor(line.length / 2)] ?? line[0] ?? [0, 0]
    return { lng: point[0] ?? 0, lat: point[1] ?? 0 }
  }

  const challenges = [
    challenge(9001, 'Footways without surface', {
      description:
        'Footways in Lichtenrade that have no `surface` tag. A made-up challenge of the Maid mock: no data of MapRoulette.',
      instruction: [
        '## Add the surface of this footway',
        '',
        'Look at the aerial imagery or street-level photos and add `surface=*` to **{{name}}**.',
        '',
        '- paved footways: `surface=paving_stones` or `surface=asphalt`',
        '- unpaved ones: `surface=compacted`, `surface=fine_gravel` or `surface=ground`',
        '',
        'More on the wiki: https://wiki.openstreetmap.org/wiki/Key:surface',
      ].join('\n'),
      checkinComment: 'Add the surface of footways #maproulette',
    }),
    challenge(9002, 'Service roads: surface=asphalt?', {
      description:
        'Service roads without a surface. The suggestion is `surface=asphalt`: check it on the imagery, then accept or reject it.',
      instruction:
        'This task suggests a tag change for {{osmIdentifier}}. Check the imagery: if the road is asphalt, accept the suggestion.',
      checkinComment: 'Surface of service roads from a MapRoulette tag fix #maproulette',
      tagFix: true,
    }),
    challenge(9003, 'Steps without handrail', {
      description: 'Steps that have no `handrail` tag.',
      instruction:
        'Add `handrail=yes` or `handrail=no` to the steps, if you can see it on a photo.',
      checkinComment: 'Handrails of steps #maproulette',
    }),
  ]

  type Task = Record<string, unknown>
  const tasks: Task[] = []
  let taskId = 190_000
  const add = (
    parent: number,
    way: Extract<OsmElement, { type: 'way' }>,
    extra: { status?: number; priority?: number; cooperativeWork?: unknown } = {},
  ) => {
    const coordinates = lineOf(way)
    if (coordinates.length < 2) return
    const id = ++taskId
    const properties: Tags = { '@id': `way/${way.id}`, ...way.tags }
    tasks.push({
      id,
      parentId: parent,
      name: `way/${way.id}`,
      title: `way/${way.id}`,
      instruction: '',
      location: { type: 'Point', coordinates: [middle(coordinates).lng, middle(coordinates).lat] },
      point: middle(coordinates),
      status: extra.status ?? 0,
      priority: extra.priority ?? 0,
      ...(extra.status ? { mappedOn: MAPPED_ON } : {}),
      geometries: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: `way/${way.id}`,
            geometry: { type: 'LineString', coordinates },
            properties,
          },
        ],
      },
      ...(extra.cooperativeWork ? { cooperativeWork: extra.cooperativeWork } : {}),
    })
  }

  const isHighway = (way: { tags?: Tags }, value: string) => way.tags?.highway === value
  const footways = ways.filter((w) => isHighway(w, 'footway') && !w.tags?.surface).slice(0, 14)
  footways.forEach((way, index) =>
    // two are fixed already, one is a high priority
    add(9001, way, {
      status: index === 3 ? 1 : index === 9 ? 2 : 0,
      priority: index === 0 ? 0 : 1,
    }),
  )
  const service = ways.filter((w) => isHighway(w, 'service') && !w.tags?.surface).slice(0, 10)
  for (const way of service)
    add(9002, way, {
      cooperativeWork: {
        meta: { version: 2, type: 1 },
        operations: [
          {
            operationType: 'modifyElement',
            data: {
              id: `way/${way.id}`,
              operations: [{ operation: 'setTags', data: { surface: 'asphalt' } }],
            },
          },
        ],
      },
    })
  const steps = ways.filter((w) => isHighway(w, 'steps') && !w.tags?.handrail).slice(0, 4)
  for (const way of steps) add(9003, way)

  await Bun.write(join(OUT, 'challenges.json'), `${JSON.stringify(challenges, null, 2)}\n`)
  await Bun.write(join(OUT, 'tasks.json'), `${JSON.stringify(tasks, null, 1)}\n`)
  const counts = challenges.map(
    (c) => `${c.id}: ${tasks.filter((t) => t.parentId === c.id).length}`,
  )
  console.log(
    `fixtures-maproulette: wrote ${OUT}/challenges.json and tasks.json (${counts.join(', ')})`,
  )
}

await build()
