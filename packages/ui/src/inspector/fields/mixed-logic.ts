import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { fieldKeys } from '../logic.ts'
import type { CombinedTags, MixedValue } from './shared.ts'

/*
 * Several features: what a field shows for a key that the features do not share. Pure. The
 * components in this folder only apply these rules (iD: placeholder "Multiple Values", title with
 * the values, a blank never overrides; see docs/research/multi-selection.md, 1.3 and 3.2).
 */

/** The placeholder of a control whose key is mixed (iD's inspector.multiple_values). */
export const MULTIPLE_VALUES = 'Multiple values'

/** The title's last line when some feature lacks the key. */
export const NOT_SET = 'not set'

/** The mixed entry of a key, or undefined when the key is one value on all features, or on none. */
export function mixedOf(
  combined: CombinedTags | undefined,
  key: string | undefined,
): MixedValue | undefined {
  if (combined === undefined || key === undefined || !Object.hasOwn(combined, key)) return undefined
  const entry = combined[key]
  return entry?.kind === 'mixed' ? entry : undefined
}

/**
 * The keys of a field that are mixed, in the field's own order: its key or keys, and the keys it owns
 * (a localized name's `name:de`, a side's other spelling). Empty without combined tags.
 */
export function mixedKeysOf(field: Field, combined: CombinedTags | undefined): string[] {
  if (combined === undefined) return []
  // fieldKeys takes the tags that the field owns; only the keys of `combined` matter here
  const asTags: Tags = Object.fromEntries(Object.keys(combined).map((key) => [key, '']))
  return fieldKeys(field, asTags).filter((key) => mixedOf(combined, key) !== undefined)
}

/**
 * The title of a mixed key: its values, one per line, and "not set" last when some feature lacks the key.
 */
export function mixedTitle(mixed: MixedValue): string {
  return [...mixed.values, ...(mixed.missing ? [NOT_SET] : [])].join('\n')
}

/** Changes whenever the mixed state of the field's keys changes. Part of a control's React key. */
export function mixedSignature(field: Field, combined: CombinedTags | undefined) {
  return JSON.stringify(mixedKeysOf(field, combined).map((key) => [key, mixedOf(combined, key)]))
}

/** What a control over one key shows of it. */
export type KeyDisplay = {
  /** The text in the control: the shared value, or empty when the key is mixed */
  value: string
  /** The placeholder: "Multiple values" when mixed, else the given one */
  placeholder: string | undefined
  /** The control's title (tooltip): the values, when mixed */
  title: string | undefined
  /** The mixed entry, when the key is mixed */
  mixed: MixedValue | undefined
}

/**
 * What a control over `key` shows. One feature, or a key that is one value on all: the tag's value and
 * the given placeholder. A mixed key: an empty control, "Multiple values", the values as the title.
 */
export function keyDisplay(
  key: string | undefined,
  tags: Tags,
  combined: CombinedTags | undefined,
  placeholder: string | undefined,
): KeyDisplay {
  const mixed = mixedOf(combined, key)
  if (mixed !== undefined) {
    return { value: '', placeholder: MULTIPLE_VALUES, title: mixedTitle(mixed), mixed }
  }
  return {
    value: key === undefined ? '' : (tags[key] ?? ''),
    placeholder,
    title: undefined,
    mixed: undefined,
  }
}

/**
 * The field types that show several values by themselves, each in its own way. Any other type gets the
 * generic mixed control (Row.tsx) when one of its keys is mixed.
 */
const HANDLES_SEVERAL = new Set([
  'text',
  'textarea',
  'url',
  'email',
  'tel',
  'identifier',
  'number',
  'roadspeed',
  'roadheight',
  'date',
  'colour',
  'combo',
  'typeCombo',
  'networkCombo',
  'semiCombo',
  'multiCombo',
  'manyCombo',
  'check',
  'defaultCheck',
  'onewayCheck',
  'radio',
  'structureRadio',
  'access',
  'directionalCombo',
  'address',
  'localized',
])

/** Whether the field type shows several values itself (see HANDLES_SEVERAL). */
export function handlesSeveral(type: string) {
  return HANDLES_SEVERAL.has(type)
}
