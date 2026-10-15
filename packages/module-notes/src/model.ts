/**
 * Pure logic of the notes module: the grid the notes are loaded by, the check of the notes API's
 * answer, and what a note shows. No React, no map, no network.
 */
import { z } from 'zod'

/** west, south, east, north in degrees: the order of the API's `bbox` parameter */
export type Bbox = [west: number, south: number, east: number, north: number]

const statusSchema = z.enum(['open', 'closed'])
export type NoteStatus = z.infer<typeof statusSchema>

const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)))

/**
 * One comment of the answer. A comment that fails is dropped by the note that holds it, the rest
 * of the note stays. `action` is `commented` when the API gives none.
 */
const apiComment = z.object({
  date: isoTime,
  /** `opened`, `commented`, `closed`, `reopened`, `hidden` as the API names them */
  action: z.string().catch('commented'),
  text: z.string(),
  uid: z.number().optional().catch(undefined),
  /** Absent for anonymous comments */
  user: z.string().optional().catch(undefined),
})
export type NoteComment = z.infer<typeof apiComment>

/**
 * One feature of the answer, read as a note. Coordinates are `[lon, lat]` and anything after them is
 * not read. A note without a readable comment is dropped (the transform gives null).
 */
const noteFeature = z
  .object({
    geometry: z.object({
      type: z.literal('Point'),
      coordinates: z
        .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
        .rest(z.unknown()),
    }),
    properties: z.object({
      id: z.number().positive().refine(Number.isInteger),
      status: statusSchema,
      date_created: isoTime,
      closed_at: isoTime.optional().catch(undefined),
      comments: z.array(apiComment.nullable().catch(null)),
    }),
  })
  .transform(({ geometry, properties }) => {
    // oldest first, as the API gives them
    const comments = properties.comments
      .filter((comment): comment is NoteComment => comment !== null)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    if (comments.length === 0) return null
    const [lon, lat] = geometry.coordinates
    return {
      id: properties.id,
      lon,
      lat,
      status: properties.status,
      created: properties.date_created,
      comments,
      ...(properties.closed_at === undefined ? {} : { closed: properties.closed_at }),
    }
  })
  .catch(null)

/** A note as the app shows it */
export type Note = NonNullable<z.infer<typeof noteFeature>>

/** Degrees per grid cell. Requests cover whole cells, so panning inside one asks nothing new. */
export const CELL_SIZE = 0.05
/** The most notes one request asks for (the API's default); a full answer may be cut short. */
export const NOTES_LIMIT = 100

/** The grid cell whose south-west corner is at (i * CELL_SIZE, j * CELL_SIZE) */
export type Cell = { i: number; j: number }

/** Which notes a cell holds: open notes only, or open and closed (`closed=0` or `closed=-1`) */
export type NotesMode = 'open' | 'all'

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

const collection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(noteFeature),
})

/**
 * Checks the notes API's answer (a GeoJSON FeatureCollection). A malformed feature is skipped and
 * counted; an answer that is not a collection at all throws.
 */
export function parseNotes(json: unknown) {
  const answer = collection.safeParse(json)
  if (!answer.success) throw new Error('The notes answer is not a FeatureCollection')
  const { features } = answer.data
  const notes = features.filter((note): note is Note => note !== null)
  return { notes, skipped: features.length - notes.length, count: features.length }
}

/**
 * The notes API's URL for one note (`notes/<id>.json`, what iD's `loadEntityNote` asks for). Only ever the editor's
 * fetch asks it, with the same API root as the notes of a view.
 */
export function noteUrl(apiUrl: string, id: number) {
  return `${apiUrl.replace(/\/+$/, '')}/api/0.6/notes/${id}.json`
}

/**
 * The answer for one note: one GeoJSON feature, as iD reads it (`parseNoteJSON` takes a single feature as a list of
 * one). A collection of one feature is taken too. A note that cannot be read is null, as in `parseNotes`.
 */
export function parseNoteAnswer(json: unknown): Note | null {
  const collection = z
    .object({ type: z.literal('FeatureCollection'), features: z.array(z.unknown()) })
    .safeParse(json)
  const feature = collection.success ? collection.data.features[0] : json
  return noteFeature.parse(feature)
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

/**
 * The zoom from which the notes load, in OSM zoom (256 px tiles, as iD and Rapid count): iD's notes `minZoom`
 * (`.reference/id/modules/svg/notes.js`). The one zoom gate of the notes: the app configs do not set it.
 * Every zoom the module compares is OSM zoom (`toOsmZoom` in maid-core converts the map's).
 */
export const NOTES_MIN_ZOOM = 12

/** Whether the notes load at an OSM zoom */
export function loadsAt(osmZoom: number, minZoom: number = NOTES_MIN_ZOOM) {
  return osmZoom >= minZoom
}

/** The one toast id of the truncated notice: a second one replaces the first, it never stacks */
export const TRUNCATED_NOTICE_ID = 'notes-truncated'

export const TRUNCATED_NOTICE_TEXT = `Only the first ${NOTES_LIMIT} notes of this area are shown. Zoom in to see all.`

/**
 * Whether the truncated notice fires, given whether it fired for the view before and whether the
 * view has a list cut at the limit. It fires once when a view starts to have a cut list, and not
 * again while that view keeps one (the map moves, the same notice stays). It is ready again after
 * a view without a cut list.
 */
export function truncationNotice(shown: boolean, truncatedInView: boolean) {
  return { shown: truncatedInView, notify: truncatedInView && !shown }
}
