/**
 * Places by name, from Nominatim (the OpenStreetMap search). One query per text the person sends (Enter or
 * "Search places", never while typing), made through the editor's fetch: the gate of its service, the time
 * limit and the automation refusal all apply. The query is kept for the session per text and language (TanStack
 * Query, never retried: a failure is asked again by the next submit). Under automation no request is made at all
 * (AGENTS.md, core rule 1): the options are disabled, and the query function refuses.
 */
import {
  isAutomated as defaultIsAutomated,
  SESSION_DATA,
  type RemoteFetch,
} from '@osm-editor-kit/maid-core'
import { queryOptions } from '@tanstack/react-query'
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
  /**
   * The query of a text, for `useQuery`: one request per text and language, kept for the session. Its query
   * function rejects on failure; a text that is empty, or an automated run, asks nothing.
   */
  query(text: string): ReturnType<typeof placeQuery>
}

function placeQuery(text: string, options: PlaceSearchOptions, automated: () => boolean) {
  const trimmed = text.trim()
  return queryOptions({
    queryKey: ['places', keyOf(trimmed, options.language)] as const,
    // no signal is passed: an answer that is no longer on screen is still kept for the next search of its text
    queryFn: async (): Promise<Place[]> => {
      if (automated()) throw new PlaceSearchError('off', 'Place search is off under automation')
      const response = await options.fetch(placeUrl(trimmed, options.language, options.endpoint))
      return placesOf(await response.json())
    },
    enabled: trimmed !== '' && !automated(),
    ...SESSION_DATA,
    retry: false,
  })
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

/** The key of a places query: the text as the search sees it, and the language */
function keyOf(query: string, language: string): string {
  return `${language}\u0000${query.trim().replace(/\s+/g, ' ').toLowerCase()}`
}

export function createPlaceSearch(options: PlaceSearchOptions): PlaceSearch {
  const automated = options.isAutomated ?? defaultIsAutomated
  return {
    enabled: () => !automated(),
    query: (text) => placeQuery(text, options, automated),
  }
}
