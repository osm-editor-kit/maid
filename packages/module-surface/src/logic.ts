/**
 * The logic of the surface and smoothness field, without React: which photo a value shows, what the pickers
 * offer, what a search over them shows, the keyboard steps through their options and the credits of the photos shown.
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

/** A value with its label, as the pickers list it */
export type Named = { value: string; label: string }

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

// ---- search ----

/** Lower case, with `_` and runs of spaces alike: `fine_gravel` and `Fine Gravel` read the same */
function searchKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim()
}

/**
 * True when the query is part of the value or of the label, case-insensitively: "asphal" finds Asphalt and
 * "fine gravel" finds `fine_gravel`. An empty query matches everything.
 */
export function matchesQuery(query: string, value: string, label: string) {
  const wanted = searchKey(query)
  if (wanted === '') return true
  return searchKey(value).includes(wanted) || searchKey(label).includes(wanted)
}

/** The tag value a typed text stands for: trimmed, lower case, spaces as `_` (as iD writes a combo's value) */
export function typedValue(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, '_')
}

/**
 * What a picker lists for a query. Without a query: all its cards. With one: the cards it matches. When no card
 * matches, the other values it knows that match, and the typed value (`typed`) so that any value can be set, unless
 * one of those other values already is the typed value.
 */
export function pickerView<Card extends Named, Other extends Named>(
  cards: readonly Card[],
  others: readonly Other[],
  query: string,
): { cards: Card[]; others: Other[]; typed: string | undefined } {
  if (query.trim() === '') return { cards: [...cards], others: [], typed: undefined }
  const matched = cards.filter((card) => matchesQuery(query, card.value, card.label))
  if (matched.length > 0) return { cards: matched, others: [], typed: undefined }
  const found = others.filter((other) => matchesQuery(query, other.value, other.label))
  const typed = typedValue(query)
  const known = typed === '' || found.some((other) => other.value === typed)
  return { cards: [], others: found, typed: known ? undefined : typed }
}

/**
 * The option an arrow key moves the highlight to, in a list of `total` options of which the first `cardCount` are
 * cards in a grid of `columns`. Up and Down move a card by its row and a value below the cards by one; Down from the
 * last row of cards goes to the first value below them. The moves stop at the ends. Undefined for any other key.
 */
export function optionStep(
  index: number,
  key: string,
  total: number,
  cardCount: number,
  columns: number,
) {
  if (total <= 0 || (key !== 'ArrowDown' && key !== 'ArrowUp')) return undefined
  const last = total - 1
  const current = Math.min(Math.max(index, 0), last)
  const inCards = current < cardCount
  const step = inCards ? columns : 1
  if (key === 'ArrowUp') return Math.max(current - step, 0)
  const next = current + step
  return inCards && next >= cardCount ? Math.min(cardCount, last) : Math.min(next, last)
}

/**
 * The surface values with no card of their own: the aliases (`earth`, `brick`, …, with the title of their surface)
 * and `salt`, which the tagging schema offers and the catalogue has no photo for.
 */
export function surfaceOthers(): Named[] {
  const cards = new Set(Object.keys(catalogue.surfaces))
  const textOnly: Named[] = [{ value: 'salt', label: 'Salt' }]
  return [...surfaceOptions().filter((option) => !cards.has(option.value)), ...textOnly]
}

/** The smoothness levels with no card for the surface: the cards show the levels that have a photo for it */
export function smoothnessOthers(shown: readonly string[]): Named[] {
  return smoothnessOptions().filter((level) => !shown.includes(level.value))
}

/** The options of the surface values: every surface, then the aliases (e.g. `concrete:plates`) with their surface's title */
function surfaceOptions(): Named[] {
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

/** The levels, best to worst */
function smoothnessOptions(): Named[] {
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
