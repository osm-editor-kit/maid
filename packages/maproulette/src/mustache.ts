/** `{{property}}` replacement in MapRoulette texts (check-in comment and source, instructions) */
import { asText } from './text.ts'

function escapeHtml(value: unknown): string {
  return asText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type Bag = Record<string, unknown>

function isBag(value: unknown): value is Bag {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Every property a `{{tag}}` can name: the properties of `taskFeatures`, then `properties`, then the properties of
 * `geometries` (or `geojson`, `geometry`) and its first feature, then the top-level keys of the task that no other
 * source set. Later sources win.
 */
export function buildAllProperties(task: unknown): Map<string, unknown> {
  const all = new Map<string, unknown>()
  if (!isBag(task)) return all
  const addAll = (props: unknown) => {
    if (!isBag(props)) return
    for (const key of Object.keys(props)) all.set(key, props[key])
  }
  if (Array.isArray(task.taskFeatures)) {
    for (const feature of task.taskFeatures) addAll(isBag(feature) ? feature.properties : undefined)
  }
  addAll(task.properties)
  const geom = task.geometries || task.geojson || task.geometry
  if (isBag(geom)) {
    addAll(geom.properties)
    if (Array.isArray(geom.features) && geom.features.length) {
      const first = geom.features[0]
      addAll(isBag(first) ? first.properties : undefined)
    }
  }
  for (const key of Object.keys(task)) if (!all.has(key)) all.set(key, task[key])
  return all
}

/** The task-like object for tags: the task with its title, so `{{osmIdentifier}}` works */
export function mustacheContextFromTask(task: unknown): Bag {
  if (!isBag(task)) return {}
  const title =
    typeof task.title === 'string' && task.title
      ? task.title
      : typeof task.name === 'string'
        ? task.name
        : ''
  return { ...task, title }
}

export type ReplaceMustacheOptions = {
  /** Escape the values for HTML, and leave unknown tags as they are (the default is plain text) */
  htmlEscape?: boolean
}

/**
 * Replace `{{name}}` with the task's property. `{{osmIdentifier}}` is the OSM id of the task title in the long
 * form (`way/123`; `w123@0` becomes `way/123`). An unknown tag is replaced by nothing, or left as it is with
 * `htmlEscape`.
 */
export function replaceMustacheTags(
  text: string,
  task: unknown,
  options: ReplaceMustacheOptions = {},
): string {
  if (!text) return ''
  const escape = options.htmlEscape === true
  const props = buildAllProperties(task)
  const title = isBag(task) ? task.title : undefined
  return text.replace(/\{\{([\w:]+)\}\}/g, (match, name: string) => {
    if (name === 'osmIdentifier' && title) {
      const osmId = asText(title).split('@')[0] ?? ''
      const longForm = osmId.replace(/^([wnr])(\d+)$/, (_m, prefix: string, num: string) => {
        const type = { w: 'way', n: 'node', r: 'relation' }[prefix]
        return type ? `${type}/${num}` : osmId
      })
      if (!/^(way|node|relation)\/\d+$/.test(longForm)) return escape ? escapeHtml(osmId) : osmId
      return longForm
    }
    if (props.has(name)) {
      const value = props.get(name)
      if (value === undefined || value === null) return ''
      return escape ? escapeHtml(value) : asText(value)
    }
    return escape ? match : ''
  })
}
