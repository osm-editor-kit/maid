/**
 * Pure logic of the notes module: the grid the notes are loaded by, the check of the notes API's
 * answer, and what a note shows. No React, no map, no network.
 */

/** west, south, east, north in degrees: the order of the API's `bbox` parameter */
export type Bbox = [west: number, south: number, east: number, north: number]

export type NoteStatus = 'open' | 'closed'

export type NoteComment = {
  date: string
  /** `opened`, `commented`, `closed`, `reopened`, `hidden` as the API names them */
  action: string
  text: string
  uid?: number
  /** Absent for anonymous comments */
  user?: string
}

export type Note = {
  id: number
  lon: number
  lat: number
  status: NoteStatus
  created: string
  closed?: string
  /** Oldest first, as the API gives them */
  comments: NoteComment[]
}

/** Degrees per grid cell. Requests cover whole cells, so panning inside one asks nothing new. */
export const CELL_SIZE = 0.05
/** The most notes one request asks for (the API's default); a full answer may be cut short. */
export const NOTES_LIMIT = 100

/** The grid cell whose south-west corner is at (i * CELL_SIZE, j * CELL_SIZE) */
export type Cell = { i: number; j: number }

/** Which notes a cell holds: open notes only, or open and closed (`closed=0` or `closed=-1`) */
export type NotesMode = 'open' | 'all'

export function cellKey(mode: NotesMode, cell: Cell) {
  return `${mode}|${cell.i},${cell.j}`
}

const round = (value: number) => Math.round(value * 1e6) / 1e6

/** Absorbs the float error of `x / CELL_SIZE` for values that sit on a grid line (13.4 / 0.05 is not exact) */
const EPSILON = 1e-7

/** The grid cells a box touches. A box whose edge lies on a grid line does not take the cell beyond it. */
export function cellsOf(bbox: Bbox) {
  const [west, south, east, north] = bbox
  const i0 = Math.floor(west / CELL_SIZE + EPSILON)
  const i1 = Math.max(i0, Math.ceil(east / CELL_SIZE - EPSILON) - 1)
  const j0 = Math.floor(south / CELL_SIZE + EPSILON)
  const j1 = Math.max(j0, Math.ceil(north / CELL_SIZE - EPSILON) - 1)
  const cells: Cell[] = []
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells.push({ i, j })
  return cells
}

/** The box of one cell */
export function cellBox({ i, j }: Cell) {
  return [
    round(i * CELL_SIZE),
    round(j * CELL_SIZE),
    round((i + 1) * CELL_SIZE),
    round((j + 1) * CELL_SIZE),
  ] satisfies Bbox
}

/** The smallest box, on the grid, that covers the cells: one request for a set of missing cells */
export function boxOf(cells: readonly Cell[]) {
  let minI = Infinity
  let minJ = Infinity
  let maxI = -Infinity
  let maxJ = -Infinity
  for (const { i, j } of cells) {
    minI = Math.min(minI, i)
    minJ = Math.min(minJ, j)
    maxI = Math.max(maxI, i)
    maxJ = Math.max(maxJ, j)
  }
  return [
    round(minI * CELL_SIZE),
    round(minJ * CELL_SIZE),
    round((maxI + 1) * CELL_SIZE),
    round((maxJ + 1) * CELL_SIZE),
  ] satisfies Bbox
}

/** The notes API request for a box: `closed=0` asks for open notes, `closed=-1` for all closed ones too */
export function notesUrl(apiUrl: string, bbox: Bbox, mode: NotesMode) {
  const base = apiUrl.replace(/\/+$/, '')
  const box = bbox.map(round).join(',')
  return `${base}/api/0.6/notes.json?bbox=${box}&closed=${mode === 'all' ? -1 : 0}&limit=${NOTES_LIMIT}`
}

/** The page of the note on openstreetmap.org. Only ever a link: nothing is fetched from it. */
export function noteWebUrl(id: number) {
  return `https://www.openstreetmap.org/note/${id}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

function parseComment(value: unknown) {
  if (!isRecord(value) || !isTime(value.date) || typeof value.text !== 'string') return undefined
  const comment: NoteComment = {
    date: value.date,
    action: typeof value.action === 'string' ? value.action : 'commented',
    text: value.text,
  }
  if (typeof value.uid === 'number') comment.uid = value.uid
  if (typeof value.user === 'string') comment.user = value.user
  return comment
}

/** One feature of the answer, or undefined when it is malformed. Malformed comments are dropped. */
function parseNote(value: unknown) {
  if (!isRecord(value) || !isRecord(value.geometry) || !isRecord(value.properties)) return undefined
  const { geometry, properties } = value
  if (geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) return undefined
  const coordinates: unknown[] = geometry.coordinates
  const [lon, lat] = coordinates
  if (typeof lon !== 'number' || typeof lat !== 'number') return undefined
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) return undefined
  const { id, status, date_created: created, closed_at: closed, comments } = properties
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return undefined
  if (status !== 'open' && status !== 'closed') return undefined
  if (!isTime(created) || !Array.isArray(comments)) return undefined
  const parsed = comments
    .map(parseComment)
    .filter((comment): comment is NoteComment => comment !== undefined)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  if (parsed.length === 0) return undefined
  const note: Note = { id, lon, lat, status, created, comments: parsed }
  if (isTime(closed)) note.closed = closed
  return note
}

/**
 * Checks the notes API's answer (a GeoJSON FeatureCollection). A malformed feature is skipped and
 * counted; an answer that is not a collection at all throws.
 */
export function parseNotes(json: unknown) {
  if (!isRecord(json) || json.type !== 'FeatureCollection' || !Array.isArray(json.features))
    throw new Error('The notes answer is not a FeatureCollection')
  const notes: Note[] = []
  let skipped = 0
  for (const feature of json.features) {
    const note = parseNote(feature)
    if (note) notes.push(note)
    else skipped++
  }
  return { notes, skipped, count: json.features.length }
}

/** The first line of the first comment, cut to a length that fits one line of a list */
export function summaryLine(note: Note) {
  const first = note.comments[0]?.text.split('\n').find((line) => line.trim() !== '')
  if (!first) return '(no text)'
  const line = first.trim()
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

/** Open notes first, then the newest first; the id breaks ties */
export function sortNotes(notes: readonly Note[]) {
  return [...notes].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    const byDate = Date.parse(b.created) - Date.parse(a.created)
    return byDate !== 0 ? byDate : b.id - a.id
  })
}

/** The notes inside a box, in the order of `sortNotes`. Closed notes only when asked for. */
export function notesIn(notes: readonly Note[], bbox: Bbox, showClosed: boolean) {
  const [west, south, east, north] = bbox
  return sortNotes(
    notes.filter(
      (note) =>
        (showClosed || note.status === 'open') &&
        note.lon >= west &&
        note.lon <= east &&
        note.lat >= south &&
        note.lat <= north,
    ),
  )
}

/** Points for the map: id, status and whether it is the chosen note */
export function markersOf(notes: readonly Note[], chosen: number | null) {
  return {
    type: 'FeatureCollection' as const,
    features: notes.map((note) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [note.lon, note.lat] },
      properties: { id: note.id, status: note.status, chosen: note.id === chosen },
    })),
  }
}
