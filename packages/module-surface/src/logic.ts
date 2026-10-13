/**
 * The logic of the surface and smoothness field, without React: which photo a value shows, what the pickers
 * offer, the keyboard steps of a grid, the suggestions of the text fallback and the credits of the photos shown.
 *
 * The catalogue is read from `@osm-editor-kit/surface-smoothness-data`, which is the only source of values, labels,
 * descriptions and photo paths. Paths are package-relative (`images/surface_asphalt.jpg`); `photos.ts` maps them to
 * the bundled files.
 */
import { catalogue, type SurfaceInfo } from '@osm-editor-kit/surface-smoothness-data'

/** The two tag keys the field writes */
export const SURFACE_KEY = 'surface'
export const SMOOTHNESS_KEY = 'smoothness'

/**
 * A picture for a tile: a surface or smoothness photo (its package-relative path), or the "usable by" vehicle emoji
 * of a smoothness level that has no photo for the surface
 */
export type Picture = { kind: 'photo'; path: string } | { kind: 'emoji'; text: string }

/** Own properties only: a tag value such as `constructor` must not find the prototype's members */
function own<T>(record: Readonly<Record<string, T>>, key: string) {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

/** The canonical surface of a tag value: `concrete:plates` and the other aliases map to their surface */
export function canonicalSurface(value: string) {
  return own(catalogue.surfaceAliases, value) ?? value
}

/** The surface's catalogue entry for a tag value, following aliases; undefined when the value is not in the catalogue */
export function surfaceInfo(value: string) {
  return own(catalogue.surfaces, canonicalSurface(value))
}

export function isKnownSurface(value: string) {
  return surfaceInfo(value) !== undefined
}

export function isKnownSmoothness(value: string) {
  return own(catalogue.smoothnessLevels, value) !== undefined
}

/** The English title of a surface tag value, or undefined for a value that is not in the catalogue */
export function surfaceTitle(value: string) {
  return surfaceInfo(value)?.title ?? undefined
}

/** The English title of a smoothness tag value, or undefined for a value that is not in the catalogue */
export function smoothnessTitle(value: string) {
  return own(catalogue.smoothnessLevels, value)?.title ?? undefined
}

/** The reference photo of a surface tag value */
export function surfacePicture(value: string) {
  const path = surfaceInfo(value)?.icon
  return path ? ({ kind: 'photo', path } satisfies Picture) : undefined
}

/** The smoothness cells of a surface (its tag value or its canonical surface); undefined without photos */
function matrixOf(surface: string) {
  return (
    own(catalogue.smoothnessMatrix, surface) ??
    own(catalogue.smoothnessMatrix, canonicalSurface(surface))
  )
}

/** The matrix cell of a surface × smoothness pair: only pairs with a photo are in the catalogue */
export function smoothnessCell(surface: string, smoothness: string) {
  const cells = matrixOf(surface)
  return cells ? own(cells, smoothness) : undefined
}

/**
 * The picture a smoothness tile shows: the surface's photo for that level when there is one, else the level's
 * "usable by" emoji (the generic picture), else nothing. Without a surface there is no photo, only the emoji.
 */
export function smoothnessPicture(surface: string | undefined, smoothness: string) {
  const cell = surface === undefined ? undefined : smoothnessCell(surface, smoothness)
  if (cell) return { kind: 'photo', path: cell.photo } satisfies Picture
  return levelEmoji(smoothness)
}

/** The "usable by" emoji of a smoothness level as a picture; undefined for a level without one */
function levelEmoji(smoothness: string) {
  const text = own(catalogue.smoothnessLevels, smoothness)?.emoji
  return text ? ({ kind: 'emoji', text } satisfies Picture) : undefined
}

// ---- pickers ----

export type SurfaceChoice = {
  value: string
  label: string
  picture: Picture | undefined
}

export type SurfaceGroup = { id: 'common' | 'other'; title: string; items: SurfaceChoice[] }

/**
 * The surfaces in the catalogue's order, in two groups: the ones StreetComplete asks the smoothness for (its
 * `smoothnessQuest` flag) first, then the rest. An empty group is left out.
 */
export function surfaceGroups() {
  const entries = Object.values(catalogue.surfaces)
  const choice = (info: SurfaceInfo) => ({
    value: info.osmValue,
    label: info.title ?? info.osmValue,
    picture: info.icon ? ({ kind: 'photo', path: info.icon } satisfies Picture) : undefined,
  })
  const groups: SurfaceGroup[] = [
    {
      id: 'common',
      title: 'Common surfaces',
      items: entries.filter((info) => info.smoothnessQuest).map(choice),
    },
    {
      id: 'other',
      title: 'Other surfaces',
      items: entries.filter((info) => !info.smoothnessQuest).map(choice),
    },
  ]
  return groups.filter((group) => group.items.length > 0)
}

export type SmoothnessChoice = {
  value: string
  label: string
  /** The reference photo's description for the surface; absent for the generic levels */
  description: string | undefined
  picture: Picture | undefined
}

/**
 * What the smoothness picker offers. For a surface with reference photos: its matrix cells, best to worst, each with
 * its photo and description (`photos: true`). Without a surface, or for a surface without photos: all levels with
 * their "usable by" emoji and no description (`photos: false`).
 */
export function smoothnessChoices(surface: string | undefined) {
  const matrix = surface === undefined ? undefined : matrixOf(surface)
  if (matrix !== undefined) {
    const choices = Object.entries(matrix).map(([value, cell]) => ({
      value,
      label: own(catalogue.smoothnessLevels, value)?.title ?? value,
      description: cell.description ?? undefined,
      picture: { kind: 'photo', path: cell.photo } satisfies Picture,
    }))
    return { photos: true, choices }
  }
  const choices = Object.values(catalogue.smoothnessLevels).map((level) => ({
    value: level.osmValue,
    label: level.title ?? level.osmValue,
    description: undefined,
    picture: levelEmoji(level.osmValue),
  }))
  return { photos: false, choices }
}

/**
 * The index of the chosen value in a grid, or the first item when nothing is chosen (or the value is not in the grid):
 * the item that takes the Tab stop.
 */
export function tabStopIndex(values: readonly string[], chosen: string | undefined) {
  const index = chosen === undefined ? -1 : values.indexOf(chosen)
  return index === -1 ? 0 : index
}

/**
 * The index a grid moves to for a key, or undefined for a key that does not move. Left and Right step by one, Up and
 * Down by a row (`columns`), Home and End go to the first and the last item. The moves stop at the ends; they do not
 * wrap. An index outside the grid is brought in first.
 */
export function gridStep(index: number, key: string, count: number, columns: number) {
  if (count <= 0 || columns <= 0) return undefined
  const last = count - 1
  const current = Math.min(Math.max(index, 0), last)
  switch (key) {
    case 'ArrowRight':
      return Math.min(current + 1, last)
    case 'ArrowLeft':
      return Math.max(current - 1, 0)
    case 'ArrowDown':
      return Math.min(current + columns, last)
    case 'ArrowUp':
      return Math.max(current - columns, 0)
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return undefined
  }
}

// ---- the text fallback ----

/** The options of the surface combo: every surface, then the aliases (e.g. `concrete:plates`) with their surface's title */
export function surfaceOptions() {
  const surfaces = Object.values(catalogue.surfaces).map((info) => ({
    value: info.osmValue,
    label: info.title ?? info.osmValue,
  }))
  const aliases = Object.entries(catalogue.surfaceAliases).map(([value, canonical]) => ({
    value,
    label: surfaceTitle(canonical) ?? canonical,
  }))
  return [...surfaces, ...aliases]
}

/** The options of the smoothness combo: the levels, best to worst */
export function smoothnessOptions() {
  return Object.values(catalogue.smoothnessLevels).map((level) => ({
    value: level.osmValue,
    label: level.title ?? level.osmValue,
  }))
}

// ---- credits ----

/**
 * The catalogue's attribution of the given package-relative files, in the catalogue's order. Shown under the pickers:
 * the photos keep their own licences (CC-BY, CC-BY-SA, public domain).
 */
export function creditsFor(paths: readonly string[]) {
  const wanted = new Set(paths)
  return catalogue.attribution.filter((entry) => wanted.has(entry.file))
}
