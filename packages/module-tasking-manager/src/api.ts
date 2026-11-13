/**
 * The HOT Tasking Manager's public API v2, as far as Maid reads it: one project and its tasks, without a login
 * (docs/research/tasking-manager.md). Locking, mapping and validating need the TM's own login and stay in the TM.
 *
 *   GET {api}/projects/{id}/          the project: texts in the language of `Accept-Language`, the changeset comment
 *   GET {api}/projects/{id}/tasks/    the tasks: a FeatureCollection of MultiPolygons with `taskId`, `taskStatus`, …
 *
 * No React here, so the parsing and the links are tested without a browser.
 */

/** The statuses of a task in the TM */
export const TASK_STATUSES = [
  'READY',
  'LOCKED_FOR_MAPPING',
  'MAPPED',
  'LOCKED_FOR_VALIDATION',
  'VALIDATED',
  'INVALIDATED',
  'BADIMAGERY',
  'SPLIT',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export type Bbox = [number, number, number, number]

/** The parts of a project that Maid uses */
export type TmProject = {
  projectId: number
  name: string
  shortDescription: string
  description: string
  instructions: string
  /** The TM's template for one task, with `{x}`, `{y}`, `{z}` of the task's grid square */
  perTaskInstructions: string
  changesetComment: string
  mappingTypes: string[]
  /** [west, south, east, north] of the area of interest */
  aoiBBOX: Bbox | null
  /** The outline of the project, a (Multi)Polygon */
  areaOfInterest: GeoJSON.Geometry | null
  percentMapped: number
  percentValidated: number
  organisationName: string
}

/** A task of a project */
export type TmTask = {
  taskId: number
  status: TaskStatus
  /** The grid square of a task of a grid project; absent on tasks drawn by hand */
  x?: number
  y?: number
  zoom?: number
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

/** Why a request failed, in words the module turns into a text */
export class TmError extends Error {
  constructor(
    readonly kind: 'not-found' | 'private' | 'http' | 'network' | 'format',
    readonly status?: number,
  ) {
    super(`Tasking Manager: ${kind}${status === undefined ? '' : ` ${status}`}`)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

function isBbox(value: unknown): value is Bbox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** The project from the TM's answer; throws TmError('format') when it is not one */
export function parseProject(body: unknown): TmProject {
  if (!isRecord(body) || typeof body.projectId !== 'number') throw new TmError('format')
  const info = isRecord(body.projectInfo) ? body.projectInfo : {}
  const aoi = body.areaOfInterest
  return {
    projectId: body.projectId,
    name: text(info.name) || `#${body.projectId}`,
    shortDescription: text(info.shortDescription),
    description: text(info.description),
    instructions: text(info.instructions),
    perTaskInstructions: text(info.perTaskInstructions),
    changesetComment: text(body.changesetComment),
    mappingTypes: Array.isArray(body.mappingTypes) ? body.mappingTypes.map(String) : [],
    aoiBBOX: isBbox(body.aoiBBOX) ? body.aoiBBOX : null,
    areaOfInterest:
      isRecord(aoi) && (aoi.type === 'Polygon' || aoi.type === 'MultiPolygon')
        ? (aoi as unknown as GeoJSON.Geometry)
        : null,
    percentMapped: num(body.percentMapped),
    percentValidated: num(body.percentValidated),
    organisationName: text(body.organisationName),
  }
}

/** The tasks from the TM's FeatureCollection; features that are not a task are left out */
export function parseTasks(body: unknown): TmTask[] {
  if (!isRecord(body) || !Array.isArray(body.features)) throw new TmError('format')
  const tasks: TmTask[] = []
  for (const feature of body.features) {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) continue
    const { properties, geometry } = feature
    if (typeof properties.taskId !== 'number') continue
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue
    const status = (TASK_STATUSES as readonly string[]).includes(String(properties.taskStatus))
      ? (properties.taskStatus as TaskStatus)
      : 'READY'
    tasks.push({
      taskId: properties.taskId,
      status,
      ...(typeof properties.taskX === 'number' ? { x: properties.taskX } : {}),
      ...(typeof properties.taskY === 'number' ? { y: properties.taskY } : {}),
      ...(typeof properties.taskZoom === 'number' ? { zoom: properties.taskZoom } : {}),
      geometry: geometry as unknown as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    })
  }
  return tasks.sort((a, b) => a.taskId - b.taskId)
}

/**
 * The instructions of one task: the TM's template with `{x}`, `{y}` and `{z}` of its grid square, as the TM's server
 * fills them in (Python's str.format). A placeholder the task has no value for stays as it is.
 */
export function taskInstructions(template: string, task: Pick<TmTask, 'x' | 'y' | 'zoom'>) {
  const values: Record<string, number | undefined> = { x: task.x, y: task.y, z: task.zoom }
  return template.replace(/\{(x|y|z)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  )
}

/** The box of a task: [west, south, east, north] */
export function taskBounds(task: Pick<TmTask, 'geometry'>): Bbox {
  const rings =
    task.geometry.type === 'Polygon' ? task.geometry.coordinates : task.geometry.coordinates.flat()
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const ring of rings)
    for (const [lon = 0, lat = 0] of ring) {
      west = Math.min(west, lon)
      east = Math.max(east, lon)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
    }
  return [west, south, east, north]
}

/** The project page in the TM */
export function projectUrl(siteUrl: string, projectId: number) {
  return `${siteUrl}/projects/${projectId}`
}

/**
 * The TM's mapping view of a project, where a task is locked and marked as mapped. The TM has no link to one task, so
 * Maid names the task's number next to this link.
 */
export function projectTasksUrl(siteUrl: string, projectId: number) {
  return `${siteUrl}/projects/${projectId}/tasks`
}

/** The editor's fetch (core: refused off localhost under automation), passed in so tests need no network */
type Send = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>

async function getJson(send: Send, url: string, language: string): Promise<unknown> {
  let response: Response
  try {
    response = await send(url, {
      headers: { Accept: 'application/json', 'Accept-Language': language },
    })
  } catch (error) {
    if (error instanceof TmError) throw error
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number') throw httpError(status)
    throw new TmError('network')
  }
  if (!response.ok) throw httpError(response.status)
  try {
    return await response.json()
  } catch {
    throw new TmError('format')
  }
}

function httpError(status: number) {
  if (status === 404) return new TmError('not-found', status)
  if (status === 401 || status === 403) return new TmError('private', status)
  return new TmError('http', status)
}

/** Reads a project and its tasks, in parallel */
export async function loadProject(
  send: Send,
  apiUrl: string,
  projectId: number,
  language: string,
): Promise<{ project: TmProject; tasks: TmTask[] }> {
  const base = apiUrl.replace(/\/$/, '')
  const [project, tasks] = await Promise.all([
    getJson(send, `${base}/projects/${projectId}/`, language).then(parseProject),
    getJson(send, `${base}/projects/${projectId}/tasks/`, language).then(parseTasks),
  ])
  return { project, tasks }
}
