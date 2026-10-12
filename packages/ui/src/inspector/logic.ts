import type { Field, Tags } from '@osm-editor-kit/maid-presets'

/** iD's unset entry in a field's options has no value (we also accept an empty one). */
export function isUnsetOption(option: { value: string | undefined }): boolean {
  return option.value === undefined || option.value === ''
}

/** The trimmed draft; an empty draft means the tag is removed. */
export function commitValue(raw: string): string | undefined {
  const value = raw.trim()
  return value === '' ? undefined : value
}

export type CheckChoice = { value: string; label: string }
export type CheckChoices = { unsetLabel: string; choices: CheckChoice[] }

const YES_NO: CheckChoice[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

/**
 * The choices of a check field. Without options: Yes and No. With options: the non-unset ones,
 * and the unset option's label for the empty entry. A current value that is not a choice is
 * added as a choice of its own, so that it stays visible.
 */
export function checkChoices(field: Field, current: string | undefined): CheckChoices {
  const unset = field.options.find((option) => isUnsetOption(option))
  const choices: CheckChoice[] =
    field.options.length > 0
      ? field.options
          .filter((option) => !isUnsetOption(option))
          .map(({ value, label }) => ({ value, label }))
      : [...YES_NO]
  if (current && !choices.some((choice) => choice.value === current)) {
    choices.push({ value: current, label: current })
  }
  return { unsetLabel: unset?.label || '–', choices }
}

/**
 * The label of the option the current value stands for, shown next to a combo's label.
 * Nothing when the value has no option, or when the label would only repeat the value.
 */
export function comboHint(field: Field, value: string | undefined): string | undefined {
  if (!value) return undefined
  const option = field.options.find((candidate) => candidate.value === value)
  return option && option.label !== value ? option.label : undefined
}

/** The keys of a multi-key field (address, access, ...) that have a value. */
export function keysWithValue(field: Field, tags: Tags): string[] {
  return (field.keys ?? []).filter((key) => (tags[key] ?? '') !== '')
}

/**
 * Changes whenever the value of the field's key (or of its keys) changes. Used as a React key
 * on the control, so that the draft starts over from the tags when they change elsewhere.
 */
export function valueSignature(field: Field, tags: Tags): string {
  const keys = field.key === undefined ? (field.keys ?? []) : [field.key]
  return JSON.stringify(keys.map((key) => tags[key] ?? ''))
}
