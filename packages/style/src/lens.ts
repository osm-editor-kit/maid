/**
 * Lenses: a named restyling of the map for one mapping theme or a quality check, e.g. "Surface"
 * colours every road by its `surface` tag. A lens is data, never code, so it can be imported and
 * exported as a file. This file is pure: it decides what a lens does to one feature. The renderer
 * (build.ts) writes the result onto the properties the layers already read, so no layer changes.
 */
import type { Tags } from './classes'

export type LensGeometry = 'line' | 'area' | 'point'

/**
 * What a tag must be for a rule to match: one value, one of several values, `true` for any value
 * (the tag is present) or `false` for a missing tag (the tag is absent).
 */
export type LensMatchValue = string | string[] | boolean

export type LensRule = {
  /** Every key must match. An empty object matches every feature. */
  match: Record<string, LensMatchValue>
  /** Stroke and outline colour as `#rgb`, `#rrggbb`, `rgb()` or `rgba()` */
  color?: string
  /** Stroke width in px, the same at every zoom level */
  width?: number
  /** Alpha of the feature: with `color` the alpha of that colour, else a factor on the feature's own alpha */
  opacity?: number
  /** Dash lengths in px, like CSS `stroke-dasharray` */
  dash?: number[]
  /** Text for the legend; without it the legend describes the match */
  label?: string
}

export type Lens = {
  id: string
  name: string
  description?: string
  /** The first rule that matches a feature decides */
  rules: LensRule[]
  /** What happens to features no rule matches. Default `dim`. */
  rest?: 'dim' | 'normal' | 'hide'
  /** The geometries the lens applies to. Default: all of them. Other features are drawn as usual. */
  geometry?: LensGeometry[]
}

/** What a lens does to one feature. Undefined fields keep the feature's own style. */
export type LensStyle = {
  color?: string
  width?: number
  dash?: number[]
  opacity?: number
  /** `rest: 'hide'`: the feature is not drawn at all */
  hidden?: boolean
}

/** Alpha of features that no rule matches when `rest` is `dim` */
export const DIM_OPACITY = 0.25
/** Alpha of a rule colour used as an area fill, close to iD's own fills */
export const FILL_ALPHA = 0.3

/** True if every key of the match holds for the tags */
export function matchesTags(match: Record<string, LensMatchValue>, tags: Tags) {
  for (const [key, want] of Object.entries(match)) {
    const have = tags[key]
    if (want === true) {
      if (have === undefined) return false
    } else if (want === false) {
      if (have !== undefined) return false
    } else if (typeof want === 'string') {
      if (have !== want) return false
    } else if (have === undefined || !want.includes(have)) {
      return false
    }
  }
  return true
}

/**
 * What the lens does to a feature with these tags, or undefined when the feature is drawn as
 * usual (the lens does not cover its geometry, or no rule matches and `rest` is `normal`).
 */
export function lensStyle(lens: Lens, tags: Tags, geometry: LensGeometry): LensStyle | undefined {
  if (lens.geometry && !lens.geometry.includes(geometry)) return undefined
  for (const rule of lens.rules) {
    if (!matchesTags(rule.match, tags)) continue
    const style: LensStyle = {}
    if (rule.color !== undefined) style.color = rule.color
    if (rule.width !== undefined) style.width = rule.width
    if (rule.dash !== undefined) style.dash = rule.dash
    if (rule.opacity !== undefined) style.opacity = rule.opacity
    return style
  }
  const rest = lens.rest ?? 'dim'
  if (rest === 'normal') return undefined
  if (rest === 'hide') return { hidden: true }
  return { opacity: DIM_OPACITY }
}

type RGBA = [number, number, number, number]

/** Reads `#rgb`, `#rrggbb`, `rgb()` and `rgba()`. Anything else is undefined. */
export function parseColour(value: string): RGBA | undefined {
  const text = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const digits = hex[1] ?? ''
    const full = digits.length === 3 ? digits.replace(/./g, (c) => c + c) : digits
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      1,
    ]
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    text,
  )
  if (fn) {
    return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])]
  }
  return undefined
}

function toRgba([r, g, b, a]: RGBA) {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`
}

/** The colour with a new alpha. A colour that cannot be read is returned as it is. */
export function withAlpha(colour: string, alpha: number) {
  const rgba = parseColour(colour)
  if (!rgba) return colour
  return toRgba([rgba[0], rgba[1], rgba[2], alpha])
}

/** The colour with its alpha multiplied by `factor`. A colour that cannot be read is returned as it is. */
export function scaleAlpha(colour: string, factor: number) {
  const rgba = parseColour(colour)
  if (!rgba) return colour
  return toRgba([rgba[0], rgba[1], rgba[2], rgba[3] * factor])
}

/**
 * The stroke or outline colour a lens gives a feature that had `colour` (undefined if it had
 * none and the lens does not bring one).
 */
export function lensColour(style: LensStyle, colour: string | undefined) {
  if (style.color !== undefined) {
    return style.opacity === undefined ? style.color : withAlpha(style.color, style.opacity)
  }
  if (colour === undefined || style.opacity === undefined) return colour
  return scaleAlpha(colour, style.opacity)
}

/**
 * The fill of an area under a lens. A rule colour fills at FILL_ALPHA, like iD's fills; an area
 * without a fill keeps none, so the lens never adds fills iD does not draw.
 */
export function lensFill(style: LensStyle, fill: string | undefined) {
  if (fill === undefined) return undefined
  if (style.color !== undefined) return withAlpha(style.color, FILL_ALPHA * (style.opacity ?? 1))
  if (style.opacity === undefined) return fill
  return scaleAlpha(fill, style.opacity)
}

/** One line of text for a match, for the legend: `surface: asphalt, concrete`, `surface is missing` */
export function describeMatch(match: Record<string, LensMatchValue>) {
  const parts = Object.entries(match).map(([key, value]) => {
    if (value === true) return `${key} is set`
    if (value === false) return `${key} is missing`
    if (typeof value === 'string') return `${key}: ${value}`
    return `${key}: ${value.join(', ')}`
  })
  return parts.length > 0 ? parts.join(', ') : 'every feature'
}
