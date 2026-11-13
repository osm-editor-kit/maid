/**
 * The made-up Tasking Manager project on the `small` scene, for the mock's Tasking Manager API (tools/mock-osm-api) and
 * the check of module-tasking-manager: project 4242 "Buildings in Lichtenrade", whose tasks are the zoom-17 tiles over
 * the scene, as the TM's grid makes them, with statuses of every kind. Instructions in Markdown, per-task instructions
 * with `{x}`, `{y}`, `{z}`, a changeset comment with the project's hashtag.
 *
 * Not TM data: written here, so it needs no request (core rule 1). The output is fixed (no randomness).
 *
 * Usage: bun run fixtures-tasking-manager   (writes fixtures/tasking-manager/project-4242.json and tasks-4242.json)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import small from '../../fixtures/small.meta.json'

const OUT = join(import.meta.dir, '../../fixtures/tasking-manager')
const PROJECT = 4242
const ZOOM = 17
const STATUSES = [
  'READY',
  'MAPPED',
  'VALIDATED',
  'INVALIDATED',
  'LOCKED_FOR_MAPPING',
  'BADIMAGERY',
  'READY',
  'READY',
]

const [west, south, east, north] = small.bbox as [number, number, number, number]
const lon2x = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** ZOOM)
const lat2y = (lat: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM)
}
const x2lon = (x: number) => (x / 2 ** ZOOM) * 360 - 180
const y2lat = (y: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** ZOOM
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}
const round = (n: number) => Math.round(n * 1e7) / 1e7

const features: unknown[] = []
let taskId = 0
for (let y = lat2y(north); y <= lat2y(south); y++)
  for (let x = lon2x(west); x <= lon2x(east); x++) {
    taskId++
    const [w, e, n, s] = [x2lon(x), x2lon(x + 1), y2lat(y), y2lat(y + 1)].map(round) as [
      number,
      number,
      number,
      number,
    ]
    const status = STATUSES[taskId % STATUSES.length]
    features.push({
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        ],
      },
      properties: {
        taskId,
        taskX: x,
        taskY: 2 ** ZOOM - 1 - y, // the TM stores the TMS row (south up)
        taskZoom: ZOOM,
        taskIsSquare: true,
        taskStatus: status,
        lockedBy: status === 'LOCKED_FOR_MAPPING' ? 1 : null,
        mappedBy: ['MAPPED', 'VALIDATED', 'INVALIDATED'].includes(status ?? '') ? 1 : null,
        validatedBy: status === 'VALIDATED' ? 2 : null,
      },
    })
  }

const ring = [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
]
const project = {
  _note:
    'Made up for the mock (tools/fixtures/tasking-manager.ts), in the shape of the TM API v2 ProjectDTO',
  projectId: PROJECT,
  status: 'PUBLISHED',
  projectPriority: 'MEDIUM',
  difficulty: 'EASY',
  private: false,
  taskCreationMode: 'GRID',
  mappingTypes: ['BUILDINGS'],
  mappingEditors: ['ID', 'JOSM', 'RAPID'],
  changesetComment: `#hotosm-project-${PROJECT} #maid-test Buildings in Lichtenrade`,
  imagery: 'tms[1,22]:https://tiles.example.org/{zoom}/{x}/{y}.png',
  idPresets: ['building', 'building/house', 'building/garage'],
  extraIdParams: '',
  organisationName: 'Maid test organisation',
  percentMapped: 38,
  percentValidated: 13,
  defaultLocale: 'en',
  aoiBBOX: [west, south, east, north],
  areaOfInterest: { type: 'MultiPolygon', coordinates: [[ring]] },
  projectInfo: {
    locale: 'en',
    name: 'Buildings in Lichtenrade (made up)',
    shortDescription: 'A made-up project for the checks of Maid.',
    description: 'A **made-up** project on the small scene. Not a real Tasking Manager project.',
    instructions:
      '## What to map\n\n- Every **building** as an area, from the aerial imagery.\n- Set `building=house` for detached houses, `building=garage` for garages.\n\nDo not map trees or fences.',
    perTaskInstructions: 'Map the buildings of tile {x}/{y} at zoom {z}.',
  },
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, `project-${PROJECT}.json`), `${JSON.stringify(project, null, 2)}\n`)
writeFileSync(
  join(OUT, `tasks-${PROJECT}.json`),
  `${JSON.stringify({ type: 'FeatureCollection', features }, null, 2)}\n`,
)
console.log(`${features.length} tasks of project ${PROJECT} written to ${OUT}`)
