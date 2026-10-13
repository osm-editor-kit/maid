/**
 * Places by name, from Nominatim (the OpenStreetMap search). One request for the text the person
 * sends (Enter or "Search places", never while typing), made through the editor's fetch: the gate of
 * its service, the time limit and the automation refusal all apply. Answers are kept in memory per
 * query and language, for the session. Under automation no request is made at all (AGENTS.md, core
 * rule 1): `enabled()` is then false and `search` refuses.
 */
import { isAutomated as defaultIsAutomated, type RemoteFetch } from '@osm-editor-kit/maid-core'
import { z } from 'zod'

export const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
/** How many places one search asks for: the ones the list shows */
export const PLACE_LIMIT = 10

export interface Place {
  /** Nominatim's place id, as text */
  id: string
  /** The full name, as Nominatim writes it, for example "Brandenburger Tor, Mitte, Berlin, Deutschland" */
  name: string
  /** Nominatim's type of the place, for example "city" or "house" */
  type: string
  lat: number
  lon: number
  /** The box the place covers, in degrees; a point has a box of no size */
  bounds?: { south: number; west: number; north: number; east: number }
}

export interface PlaceSearchOptions {
  /** The editor's fetch (`editor.fetch`): gate, time limit, automation refusal */
  fetch: RemoteFetch
  /** The language of the names, the `accept-language` of the request, for example `de` */
  language: string
  /** Default: `isAutomated` from maid-core. Under automation nothing is sent. */
  isAutomated?: () => boolean
  /** Default: `NOMINATIM_SEARCH`. Tests may point it elsewhere. */
  endpoint?: string
}

export interface PlaceSearch {
  /** False under automation: the caller shows a hint and asks nothing */
  enabled(): boolean
  /** The places for a text. One request per text and language; later asks are answered from memory. Rejects on failure. */
  search(query: string): Promise<Place[]>
}

/** The search is off (automation), or the answer did not have the shape the search reads */
export class PlaceSearchError extends Error {
  constructor(
    readonly reason: 'off' | 'failed' | 'format',
    message: string,
  ) {
    super(message)
    this.name = 'PlaceSearchError'
  }
}

/** A number in a string, as Nominatim sends them (`"52.5200"`), within a range */
function degrees(min: number, max: number) {
  return z
    .string()
    .regex(/^[+-]?\d+(?:\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(min).max(max))
}

/** The fields Maid uses of one answer. Nominatim sends more; the rest is dropped here. */
export const NominatimPlace = z.object({
  place_id: z.number().optional(),
  display_name: z.string(),
  type: z.string().optional(),
  category: z.string().optional(),
  lat: degrees(-90, 90),
  lon: degrees(-180, 180),
  // [south, north, west, east], as Nominatim writes it
  boundingbox: z
    .tuple([degrees(-90, 90), degrees(-90, 90), degrees(-180, 180), degrees(-180, 180)])
    .optional(),
})

export const NominatimAnswer = z.array(NominatimPlace)

/** Reads the answer into places. Nothing is kept that the list does not show. */
export function placesOf(answer: unknown): Place[] {
  const parsed = NominatimAnswer.safeParse(answer)
  if (!parsed.success)
    throw new PlaceSearchError('format', 'The place search answered in another shape')
  return parsed.data.map((item) => {
    const place: Place = {
      id: String(item.place_id ?? `${item.lat},${item.lon}`),
      name: item.display_name,
      type: item.type ?? item.category ?? 'place',
      lat: item.lat,
      lon: item.lon,
    }
    if (item.boundingbox) {
      const [south, north, west, east] = item.boundingbox
      place.bounds = { south, west, north, east }
    }
    return place
  })
}

/** The request for a text: format, the number of places, the text and the language */
export function placeUrl(query: string, language: string, endpoint = NOMINATIM_SEARCH): URL {
  const url = new URL(endpoint)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', String(PLACE_LIMIT))
  url.searchParams.set('q', query)
  url.searchParams.set('accept-language', language)
  return url
}

/** The key of the memory: the text as the search sees it, and the language */
function keyOf(query: string, language: string): string {
  return `${language}\u0000${query.trim().replace(/\s+/g, ' ').toLowerCase()}`
}

export function createPlaceSearch(options: PlaceSearchOptions): PlaceSearch {
  const automated = options.isAutomated ?? defaultIsAutomated
  const memory = new Map<string, Promise<Place[]>>()
  return {
    enabled: () => !automated(),
    search(query) {
      if (automated())
        return Promise.reject(new PlaceSearchError('off', 'Place search is off under automation'))
      const key = keyOf(query, options.language)
      const known = memory.get(key)
      if (known) return known
      const url = placeUrl(query.trim(), options.language, options.endpoint)
      const asked = options
        .fetch(url)
        .then((response) => response.json())
        .then(placesOf)
      // a failure is not kept: the next Enter asks again
      asked.catch(() => memory.delete(key))
      memory.set(key, asked)
      return asked
    },
  }
}
