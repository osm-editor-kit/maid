/**
 * GPX: text a person gave or a URL returned, read as XML and converted to GeoJSON with togeojson. The converter is
 * loaded with `import()` when a GPX is read, so it is not in the main chunk. Pure apart from that: no network.
 */
import type { Checked } from './config.ts'
import type { GeoJsonData } from './geojson.ts'

const NOT_GPX = 'This is not GPX: it must be XML with a gpx element at the top.'
const NOT_CONVERTED = 'This GPX file could not be converted.'

/** The start of XML text: a prolog, comments, then the root element. Only the first part is read. */
const ROOT_PATTERN = /^\s*(?:<\?[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<([A-Za-z_][\w.:-]*)/

/** The name of the root element of XML text, in lower case; `undefined` when the text does not start with one */
export function xmlRootName(text: string): string | undefined {
  return ROOT_PATTERN.exec(text.slice(0, 2000))?.[1]?.toLowerCase()
}

/** Whether text is GPX XML, by its root element (a GPX file named `.gpx` is still checked here) */
export function isGpxText(text: string) {
  return xmlRootName(text) === 'gpx'
}

/** Whether text is KML XML, by its root element */
export function isKmlText(text: string) {
  return xmlRootName(text) === 'kml'
}

/** The XML document of text, through the browser's parser. `undefined` when it is not well-formed XML. */
function parseXml(text: string): Document | undefined {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  // a browser answers malformed XML with a document whose root is a `parsererror`, not with an exception
  if (doc.getElementsByTagName('parsererror').length > 0) return undefined
  return doc
}

/**
 * Parses GPX text into a GeoJSON FeatureCollection: tracks and routes become LineStrings (MultiLineStrings for
 * several segments), waypoints become Points. Refused in plain words when the text is not XML or its root is not `gpx`.
 */
export async function parseGpx(text: string): Promise<Checked<GeoJsonData>> {
  const doc = parseXml(text)
  if (!doc || doc.documentElement?.localName.toLowerCase() !== 'gpx') {
    return { ok: false, errors: [NOT_GPX] }
  }
  const { gpx } = await import('@tmcw/togeojson')
  try {
    return { ok: true, value: gpx(doc) }
  } catch {
    return { ok: false, errors: [NOT_CONVERTED] }
  }
}
