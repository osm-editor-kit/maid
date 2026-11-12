/**
 * What the app says about its look without a lens ("Maid standard"): a description and a chosen legend, for an app whose own
 * look adds to iD's style (the bicycle editor draws its bicycle infrastructure). Set once by `lenses({ defaultLook })`
 * when the module is set up, read by the panel.
 */
import type { LensLegend } from '@osm-editor-kit/maid-style'

export type DefaultLook = {
  /** Instead of "The default look." */
  description?: string
  legend?: LensLegend
}

let current: DefaultLook = {}

export function setDefaultLook(look: DefaultLook) {
  current = look
}

export function defaultLook(): DefaultLook {
  return current
}
