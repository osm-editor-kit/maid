/**
 * The URL parameter of the data layers module, `data`: the address of a GeoJSON, GPX or PMTiles file that a link shows
 * as a layer (`?data=https://…/bike.geojson`). Its iD name is `gpx` (module.tsx): iD's `gpx=` link loads the same kind
 * of file, so an iD link with a GPX track shows it here. KML is not read.
 * This module writes nothing back for a layer added by hand (docs/research/url-state-audit.md, section 5).
 *
 * Pure: no React, no network. The parser has the shape of core's `UrlParser`.
 */
import type { UrlParser } from '@osm-editor-kit/maid-core'
import { checkLayerUrl, guessKind } from './config.ts'

/**
 * A remote data address: GeoJSON, GPX or PMTiles, https (or a path on this server). Vector tiles need source layer names
 * a link cannot give, so they are no opinion (null), like an address that is not valid. The value is trimmed.
 */
export const parseAsDataLink: UrlParser<string> = {
  parse(value) {
    const url = value.trim()
    if (url === '') return null
    const kind = guessKind(url)
    if (kind === 'vector') return null
    return checkLayerUrl(url, kind) === undefined ? url : null
  },
  serialize: (value) => value,
  eq: (a, b) => a === b,
}

/** The name of a layer a link adds: its file name without the extension (.geojson, .json, .gpx, .pmtiles), else "Linked data" */
export function linkedLayerName(url: string): string {
  const path = url.split(/[?#]/)[0] ?? ''
  const last =
    path
      .split('/')
      .filter((part) => part !== '')
      .pop() ?? ''
  let name = last.replace(/\.(geojson|json|gpx|pmtiles)$/i, '')
  try {
    name = decodeURIComponent(name)
  } catch {
    // a name that is not encoded properly is shown as it is
  }
  return name.trim() || 'Linked data'
}

/** A 32-bit FNV-1a hash of the text, in base 36 */
function hashOf(text: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * The id of the layer a link adds: the same for the same address, so that its hidden state (stored by the person's
 * choice) and its cache entry hold across reloads. Letters, digits and "-", as the layer ids are checked.
 */
export function linkedLayerId(url: string): string {
  return `link-${hashOf(url)}`
}
