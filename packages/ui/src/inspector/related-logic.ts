import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { fieldKeys } from './logic.ts'

/**
 * Related tags of a field: tags about a field's key that have no field of their own, like
 * `source:width`, `note:width` or `check_date:surface`. They show as lines below the field and can
 * be edited there. Numbered keys (`source:width:1`) are not handled.
 */

export type RelatedCategory = 'source' | 'note' | 'check_date'

export const RELATED_CATEGORIES: readonly RelatedCategory[] = ['source', 'note', 'check_date']

export const CATEGORY_LABELS: Readonly<Record<RelatedCategory, string>> = {
  source: 'Source',
  note: 'Note',
  check_date: 'Checked',
}

/** A related tag that is set. */
export type RelatedTag = {
  key: string
  category: RelatedCategory
  /** the key of the field this tag is about (`width`, `cycleway:left`) */
  baseKey: string
  value: string
}

/** A related key that can be added: a related tag without its value. */
export type RelatedSlot = Omit<RelatedTag, 'value'>

/** The keys of one field (the owner of related tags). */
export type FieldKeys = { id: string; keys: readonly string[] }

/**
 * The title buttons: per field key, the related key each button adds
 * (`width` → `{ source: 'source:width' }`). Replace this constant to change the offered keys.
 */
export type RelatedButtons = Readonly<Record<string, Partial<Record<RelatedCategory, string>>>>

/**
 * The keys the add buttons offer, from taginfo counts (2026-09-30, world / Berlin). Only where the
 * tag is common; the key form is the more common one (`surface:note` over `note:surface`). Other
 * related tags still show below their field when they are set.
 */
export const RELATED_BUTTONS: RelatedButtons = {
  // source 2.8M / 31k, note 5k / 22
  maxspeed: { source: 'source:maxspeed', note: 'note:maxspeed' },
  // 131k / 25k
  width: { source: 'source:width' },
  'width:effective': { source: 'source:width:effective' },
  'cycleway:width': { source: 'source:cycleway:width' },
  'cycleway:left:width': { source: 'source:cycleway:left:width' },
  'cycleway:right:width': { source: 'source:cycleway:right:width' },
  'cycleway:both:width': { source: 'source:cycleway:both:width' },
  'sidewalk:left:width': { source: 'source:sidewalk:left:width' },
  'sidewalk:right:width': { source: 'source:sidewalk:right:width' },
  'sidewalk:both:width': { source: 'source:sidewalk:both:width' },
  // Berlin only, new tag of the Radnetz mapping
  'buffer:left': { source: 'source:buffer:left' },
  'buffer:right': { source: 'source:buffer:right' },
  'buffer:both': { source: 'source:buffer:both' },
  // Berlin, note and description
  'parking:left': { note: 'parking:left:note' },
  'parking:right': { note: 'parking:right:note' },
  'parking:both': { note: 'parking:both:note' },
  'sett:length': { source: 'source:sett:length' },
  // check date 297k / 2.2k, source 65k / 56, note 10k / 84
  surface: { source: 'source:surface', note: 'surface:note', check_date: 'check_date:surface' },
  smoothness: { check_date: 'check_date:smoothness' },
  cycleway: { check_date: 'check_date:cycleway' },
  tactile_paving: { check_date: 'check_date:tactile_paving' },
  crossing: { check_date: 'check_date:crossing' },
  lit: { source: 'source:lit', check_date: 'check_date:lit' },
  name: { source: 'source:name', note: 'note:name' },
  ref: { source: 'source:ref' },
  lanes: { source: 'source:lanes', note: 'note:lanes' },
  oneway: { source: 'source:oneway' },
  access: { source: 'source:access', note: 'note:access' },
  bicycle: { source: 'source:bicycle' },
  traffic_sign: { note: 'note:traffic_sign' },
  bicycle_road: { note: 'note:bicycle_road' },
}

/** The category of `tagKey` when it is a related tag of `baseKey`, else `undefined`. */
export function relatedCategoryOf(tagKey: string, baseKey: string): RelatedCategory | undefined {
  if (!baseKey || tagKey === baseKey) return undefined
  if (tagKey === `source:${baseKey}` || tagKey === `${baseKey}:source`) return 'source'
  if (
    [
      `note:${baseKey}`,
      `description:${baseKey}`,
      `${baseKey}:note`,
      `${baseKey}:description`,
    ].includes(tagKey)
  )
    return 'note'
  if (tagKey === `check_date:${baseKey}` || tagKey === `${baseKey}:check_date`) return 'check_date'
  return undefined
}

/**
 * Assigns each set related tag to the field whose key it is about. With several candidates the
 * most specific key wins. A key in `ownKeys` is a field's own key (even of a field that is not an
 * owner here), so it is never a related tag. `ownKeys` defaults to the owners' keys.
 */
export function assignRelatedTags(
  owners: readonly FieldKeys[],
  tags: Tags,
  ownKeys: Iterable<string> = owners.flatMap((owner) => owner.keys),
) {
  const result = new Map<string, RelatedTag[]>()
  const owned = new Set(ownKeys)
  for (const [tagKey, value] of Object.entries(tags)) {
    if (value === '' || owned.has(tagKey)) continue
    let best: { fieldID: string; tag: RelatedTag } | undefined
    for (const owner of owners) {
      for (const baseKey of owner.keys) {
        const category = relatedCategoryOf(tagKey, baseKey)
        if (category === undefined) continue
        if (best === undefined || baseKey.length > best.tag.baseKey.length) {
          best = { fieldID: owner.id, tag: { key: tagKey, category, baseKey, value } }
        }
      }
    }
    if (best === undefined) continue
    const list = result.get(best.fieldID) ?? []
    list.push(best.tag)
    result.set(best.fieldID, list)
  }
  for (const list of result.values()) list.sort(compareRelatedTags)
  return result
}

export function compareRelatedTags(a: RelatedSlot, b: RelatedSlot) {
  return (
    RELATED_CATEGORIES.indexOf(a.category) - RELATED_CATEGORIES.indexOf(b.category) ||
    a.baseKey.localeCompare(b.baseKey) ||
    a.key.localeCompare(b.key)
  )
}

/**
 * The keys a field owns related tags for: each key of the field (a field over several keys, like
 * a directional one, owns the related tags of each). Prefix keys (`payment:`) are left out.
 */
export function relatedBaseKeys(field: Field) {
  return fieldKeys(field).filter((key) => !key.endsWith(':'))
}

/** The side or direction a related key is about (`cycleway:left:width` → `left`). */
export function relatedSide(baseKey: string) {
  return /(?:^|:)(left|right|both|forward|backward)(?::|$)/.exec(baseKey)?.[1]
}

/**
 * The label of a related tag: its category, with the side (or the key) in brackets when the field
 * has several keys and the tag is not about the field's own key (`Source (left)`).
 */
export function relatedLabel(slot: RelatedSlot, field: Field) {
  const base = CATEGORY_LABELS[slot.category]
  const baseKeys = relatedBaseKeys(field)
  const mainKey = field.key ?? baseKeys[0]
  if (baseKeys.length < 2 || slot.baseKey === mainKey) return base
  return `${base} (${relatedSide(slot.baseKey) ?? slot.baseKey})`
}

/**
 * The related keys the add buttons offer for a field: a button's key when its field key has a
 * value (the main key also when another key of the field has one), and only while that related
 * tag is not set. `buttons` defaults to RELATED_BUTTONS.
 */
export function relatedButtonKeys(
  baseKeys: readonly string[],
  mainKey: string | undefined,
  tags: Tags,
  buttons: RelatedButtons = RELATED_BUTTONS,
) {
  const has = (key: string) => (tags[key] ?? '') !== ''
  const anyValue = baseKeys.some(has)
  const result = new Map<string, RelatedSlot>()
  for (const baseKey of baseKeys) {
    const entry = buttons[baseKey]
    if (!entry || !(has(baseKey) || (baseKey === mainKey && anyValue))) continue
    for (const category of RELATED_CATEGORIES) {
      const key = entry[category]
      if (key && !has(key) && !result.has(key)) result.set(key, { key, category, baseKey })
    }
  }
  return [...result.values()]
}
