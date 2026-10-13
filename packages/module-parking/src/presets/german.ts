import type { PresetData } from '@osm-editor-kit/maid-presets'
import { LABELS_DE } from './labels-de.ts'

type Record_ = Record<string, unknown>

function record(value: unknown): Record_ {
  return typeof value === 'object' && value !== null ? (value as Record_) : {}
}

/**
 * The preset data with the German names and labels of the parking presets and fields (labels-de.ts) in place of
 * the English ones. `PresetChanges` takes English texts only, so the app applies this after `withChanges`, when the
 * visit is in German; the data is copied, the base is not changed. Ids that are not in the data are skipped.
 * Everything not named in LABELS_DE (iD's own presets and fields) stays as it is.
 */
export function withGermanLabels(data: PresetData): PresetData {
  const root = record(data.translations)
  const en = record(root.en)
  const section = record(en.presets)
  const presets: Record_ = { ...record(section.presets) }
  const fields: Record_ = { ...record(section.fields) }
  for (const [id, name] of Object.entries(LABELS_DE.presets)) {
    if (id in presets) presets[id] = { ...record(presets[id]), name }
  }
  for (const [id, label] of Object.entries(LABELS_DE.fields)) {
    if (!(id in fields)) continue
    const options = (LABELS_DE.options as Record<string, Record<string, string> | undefined>)[id]
    const entry = record(fields[id])
    fields[id] = {
      ...entry,
      label,
      ...(options ? { options: { ...record(entry.options), ...options } } : {}),
    }
  }
  return {
    ...data,
    translations: { ...root, en: { ...en, presets: { ...section, presets, fields } } },
  }
}
