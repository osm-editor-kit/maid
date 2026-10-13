/**
 * Custom background layers. A tile URL template, as iD's custom background takes it, becomes what
 * MapLibre's raster source takes, or is refused with a reason a person can read. Also the name iD
 * cites for it in `imagery_used` (keys removed), and the small helpers the saved list needs.
 *
 * Pure: no React, no MapLibre and no ELI at run time (the types are imported only), so the tests
 * run without a browser. Follows iD's `url()` and `imageryUsed()` in
 * `modules/renderer/background_source.js`, and MapLibre's own raster tokens (`{quadkey}`,
 * `{bbox-epsg-3857}`, `{ratio}` and `scheme`).
 */
import type { RasterSourceSpec } from '@osm-editor-kit/maplibre-editor-layer-index'
import type { Drawn } from './eli.ts'

/** A saved custom background. The shape is the Radnetz fork's, so a list can be copied over by hand. */
export type CustomEntry = { id: string; name: string; template: string }

/** Tiles are 256 px, as iD and ELI count them. There is no min or max zoom: MapLibre overzooms. */
export const TILE_SIZE = 256

/** The id of a saved entry: `custom-1`, `custom-2`, ... */
export const CUSTOM_ID = /^custom-([1-9]\d*)$/

export function customId(number: number) {
  return `custom-${number}`
}

/** The number in a custom id (`custom-7` gives 7); 0 for any other id */
export function customNumber(id: string) {
  return Number(CUSTOM_ID.exec(id)?.[1] ?? 0)
}

export function isCustomId(id: string | null) {
  return id !== null && CUSTOM_ID.test(id)
}

export type Translated = { ok: true; source: RasterSourceSpec } | { ok: false; reason: string }

export type Checked = { ok: true; template: string } | { ok: false; reason: string }

const TOKEN = /\{([^{}]*)\}/g
const SWITCH = /\{switch:[^{}]*\}/
/** The edges of a WMS tile. MapLibre has no token for them, so they are refused. */
const RETIRED = new Set(['w', 's', 'n', 'e'])

/**
 * Removes the line breaks and the spaces around a template, as iD's custom background does when
 * it saves one. Spaces inside the template are kept: they make the template refused.
 */
export function cleanTemplate(template: string) {
  return template.replace(/[\r\n]+/g, '').trim()
}

function refuse(reason: string): { ok: false; reason: string } {
  return { ok: false, reason }
}

/** What MapLibre's token stands for. `{@2x}` and `{r}` depend on the device's pixel ratio, as in MapLibre. */
function toMapLibre(name: string, devicePixelRatio: number): string {
  switch (name) {
    case 'zoom':
      return '{z}'
    case '-y':
    case 'ty':
      return '{y}'
    case 'u':
      return '{quadkey}'
    case '@2x':
    case 'r':
      // MapLibre gives `@2x` for a pixel ratio above 1 (its `{ratio}`): the same rule, decided here
      return devicePixelRatio > 1 ? '@2x' : ''
    case 'bbox':
      return '{bbox-epsg-3857}'
    case 'proj':
      return 'EPSG:3857'
    case 'wkid':
      return '3857'
    case 'width':
    case 'height':
      return String(TILE_SIZE)
    default:
      // `{z}`, `{x}` and `{y}` are the same in MapLibre
      return `{${name}}`
  }
}

function protocolOf(url: string): string | null {
  try {
    return new URL(url).protocol
  } catch {
    return null
  }
}

/**
 * The template as MapLibre's raster source takes it, or a reason why it is refused.
 *
 * - `{z}` or `{zoom}`, `{x}`, `{y}`: XYZ tiles. `{-y}` or `{ty}`: TMS rows (`scheme: 'tms'`), and
 *   then `{y}` is the only y in the template.
 * - `{u}`: quadkey tiles (MapLibre's `{quadkey}`).
 * - `{bbox}`: WMS (MapLibre's `{bbox-epsg-3857}`), with `{proj}` and `{wkid}` as EPSG:3857 and
 *   `{width}` and `{height}` as 256. Those four only make sense with `{bbox}`.
 * - `{switch:a,b,c}`: one tile URL per host. MapLibre picks `urls[(x + y) % n]`, the rule iD uses.
 * - `{@2x}` or `{r}`: `@2x` when `devicePixelRatio` is above 1, nothing otherwise.
 * - `{w}`, `{s}`, `{n}`, `{e}` are refused: MapLibre has no token for them.
 *
 * The hash part (`#...`) is dropped, as iD drops it. Only http and https are accepted.
 */
export function toRasterSource(
  template: string,
  options: { devicePixelRatio: number },
): Translated {
  const text = cleanTemplate(template).replace(/#[\s\S]*/u, '')
  if (text === '') return refuse('Enter a tile URL template.')
  if (!/^https?:\/\//i.test(text)) {
    return refuse('The template must start with https:// or http://.')
  }
  if (/[{}]/.test(text.replace(TOKEN, ''))) {
    return refuse('A brace has no partner: each { needs a } after it, and a } needs a {.')
  }

  const names = [...text.matchAll(TOKEN)].map((match) => match[1] ?? '')
  let zoom = false
  let x = false
  let y = false
  let flipped = false
  let quadkey = false
  let bbox = false
  let wmsOnly: string | null = null
  const switches: string[] = []
  for (const name of names) {
    if (name === 'z' || name === 'zoom') zoom = true
    else if (name === 'x') x = true
    else if (name === 'y') y = true
    else if (name === '-y' || name === 'ty') flipped = true
    else if (name === 'u') quadkey = true
    else if (name === 'bbox') bbox = true
    else if (name === '@2x' || name === 'r') {
      // retina: decided by the pixel ratio in `toMapLibre`
    } else if (name === 'proj' || name === 'wkid' || name === 'width' || name === 'height') {
      wmsOnly = wmsOnly ?? name
    } else if (RETIRED.has(name)) {
      return refuse(
        `{${name}} is not supported: MapLibre has no token for it. Use {bbox} for a WMS template.`,
      )
    } else if (name.startsWith('switch:')) {
      switches.push(name.slice('switch:'.length))
    } else {
      return refuse(`The token {${name}} is not supported.`)
    }
  }

  if (switches.length > 1) return refuse('Use one {switch:…} in a template.')
  const choices = switches[0]?.split(',') ?? []
  if (switches.length === 1 && choices.some((choice) => choice === '')) {
    return refuse('{switch:…} needs one or more hosts, separated by commas, with none left empty.')
  }

  if (wmsOnly !== null && !bbox) {
    return refuse(`{${wmsOnly}} is only used in a WMS template, together with {bbox}.`)
  }
  const tileAddress = zoom || x || y || flipped
  const kinds = [tileAddress, quadkey, bbox].filter(Boolean).length
  if (kinds === 0) {
    return refuse('Use {z}, {x} and {y} for tiles, {u} for quadkeys, or {bbox} for WMS.')
  }
  if (kinds > 1) {
    return refuse('Use one kind of address in a template: {z}, {x} and {y}, or {u}, or {bbox}.')
  }
  if (y && flipped) return refuse('Use either {y} or {-y}, not both.')
  if (tileAddress && !(zoom && x && (y || flipped))) {
    return refuse('Tiles need {z} (or {zoom}), {x} and {y}.')
  }

  const tiles = (switches.length === 1 ? choices : ['']).map((choice) => {
    const withHost = switches.length === 1 ? text.replace(SWITCH, () => choice) : text
    return withHost.replace(TOKEN, (_token: string, name: string) =>
      toMapLibre(name, options.devicePixelRatio),
    )
  })
  for (const tile of tiles) {
    // the tokens are replaced by a letter, so that the address can be read as a URL
    const protocol = protocolOf(tile.replace(/\{[^{}]*\}/g, 'x'))
    if (protocol === null) return refuse('This is not a web address.')
    if (protocol !== 'http:' && protocol !== 'https:') {
      return refuse('The template must start with https:// or http://.')
    }
  }

  const scheme: 'tms' | undefined = flipped ? 'tms' : undefined
  const source: RasterSourceSpec = {
    type: 'raster',
    tiles,
    tileSize: TILE_SIZE,
    ...(scheme ? { scheme } : {}),
  }
  return { ok: true, source }
}

/**
 * Whether a template can be saved: the cleaned template when it translates, the reason when not.
 * The pixel ratio does not matter for this check.
 */
export function checkTemplate(template: string): Checked {
  const result = toRasterSource(template, { devicePixelRatio: 1 })
  if (!result.ok) return result
  return { ok: true, template: cleanTemplate(template) }
}

/** Two templates are the same when they are the same once cleaned */
export function sameTemplate(a: string, b: string) {
  return cleanTemplate(a) === cleanTemplate(b)
}

const SECRET_NAME = /key|token|secret|sig|auth|pass|pwd|connectid|credential|session/i

/**
 * The template with its keys and tokens replaced by `{apikey}`, as iD cites it. The hash is dropped
 * and so is a user name and password before the host. A query parameter whose name looks like a
 * key or a token keeps its name, but its value becomes `{apikey}`; so do `token/<value>` in the
 * path and `key=<value>` anywhere, as iD does for WMS and TMS keys.
 */
export function redactTemplate(template: string) {
  let text = cleanTemplate(template).replace(/#[\s\S]*/u, '')
  text = text.replace(/^(https?:\/\/)[^/?]*@/i, '$1')
  const query = text.indexOf('?')
  if (query !== -1) {
    const tail = text
      .slice(query + 1)
      .replace(/([^&;=]+)=([^&;]*)/g, (pair: string, name: string) =>
        SECRET_NAME.test(name) ? `${name}={apikey}` : pair,
      )
    text = `${text.slice(0, query)}?${tail}`
  }
  return text
    .replace(/\/token\/[^/?]+/gi, '/token/{apikey}')
    .replace(/(key=)[^&;/?]+/gi, '$1{apikey}')
}

/**
 * The name iD cites for a custom background in a changeset or a `source:` tag: `Custom (<template> )`
 * with the keys removed (see `redactTemplate`). iD's own rule, including its space before the `)`.
 */
export function citedName(template: string) {
  return `Custom (${redactTemplate(template)} )`
}

/**
 * A short label for a template without a name: the host and path, without the scheme, `www.`, the
 * query, the hash and every token (from the first `{` on), as the Radnetz fork shows it.
 */
export function shortLabel(template: string) {
  const text = redactTemplate(template).replace(/\s+/g, ' ').trim()
  const bare = text.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  const head = bare.split(/[?#]/)[0] ?? ''
  return head
    .replace(/\{[\s\S]*$/, '')
    .replace(/\/+$/, '')
    .replace(/^\.+/, '')
}

function hash(text: string) {
  let value = 5381
  for (let index = 0; index < text.length; index++) {
    value = ((value << 5) + value + text.charCodeAt(index)) | 0
  }
  return (value >>> 0).toString(36)
}

/**
 * A custom background ready to draw, in the same shape as an index layer (`drawLayer` in `eli.ts`),
 * or undefined when the template is refused. The source id carries a hash of the template, so an
 * edited template is drawn as a new source and not patched in place.
 */
export function drawCustom(
  id: string,
  template: string,
  background: boolean,
  devicePixelRatio: number,
): Drawn | undefined {
  const translated = toRasterSource(template, { devicePixelRatio })
  if (!translated.ok) return undefined
  const sourceId = `imagery-${id.replace(/[^\w-]/g, '_')}-${hash(cleanTemplate(template))}`
  return {
    id,
    name: citedName(template),
    sourceId,
    source: translated.source,
    layer: { id: sourceId, type: 'raster', source: sourceId },
    background,
  }
}
