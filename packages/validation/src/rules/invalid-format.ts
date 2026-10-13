import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import type { Tags } from '../tags.ts'
import type { Fix, Issue, Rule } from '../types.ts'

// Ported from iD's invalid_format (ISC, © iD contributors), at commit 0194f3926: the website and
// email formats and the Wikimedia Commons tags. Maid has no presets here, so the message names the
// tag key ("in website") where iD names the field's label ("in Website"). iD's "suggestion"
// severity is a warning here, because Maid's Severity has no suggestion.

/** iD's osmUrlKeys: the tags whose value is a URL */
const urlKeys: ReadonlySet<string> = new Set([
  'website',
  'url',
  'contact:website',
  'contact:url',
  'source:website',
  'source:url',
  'image',
  'brand:website',
  'operator:website',
  'network:website',
  'website:en',
  'website:fr',
  'website:menu',
  'post_office:website',
])

/** iD's utilIsValidURL: a URL the WHATWG parser accepts with an http or https protocol. When not strict, also a loose http(s) match. */
function isValidURL(url: string, strict = false) {
  try {
    return new URL(url).protocol.startsWith('http')
  } catch {
    if (strict) return false
    return /^https?:\/\/\S+$/i.test(url)
  }
}

/** A value without a protocol that looks like a domain: its host has a dot */
function isFixableURL(url: string) {
  try {
    return new URL(`https://${url}`).hostname.includes('.')
  } catch {
    return false
  }
}

/** Emails in OSM are official, so the pattern is simple; negated lists allow any Unicode name (iD #6494) */
const emailPattern = /^[^()\\,":;<>@[\]]+@[^()\\,":;<>@[\].]+(?:\.[a-z0-9-]+)*$/i

/** An empty email is acceptable */
function isValidEmail(email: string) {
  return !email || emailPattern.test(email)
}

/**
 * iD's cleanWikimediaCommonsReference: a file or category name in the `image` tag, which belongs
 * in `wikimedia_commons`. `undefined` when there is none, or when `wikimedia_commons` is set.
 */
function wikimediaReferenceOf(value: string, tags: Tags) {
  if (tags.wikimedia_commons) return undefined
  for (const prefix of ['file', 'datei', 'fichier', 'plik']) {
    if (value.toLowerCase().startsWith(`${prefix}:`)) return `File${value.slice(prefix.length)}`
  }
  return value.startsWith('Category:') ? value : undefined
}

/** Sets a protocol on the URL tag; `{protocol}` in the value is where it goes */
function protocolFix(entityId: string, key: string, value: string, protocol: string) {
  const label = `Set ${protocol.toUpperCase()} for the URL`
  return {
    id: `add_protocol_${protocol}`,
    label,
    annotation: label,
    actions: (graph: Graph) => {
      const entity = graph.hasEntity(entityId)
      if (!entity) return []
      const tags = { ...entity.tags, [key]: value.replace('{protocol}', protocol) }
      return [actionChangeTags(entityId, tags)]
    },
  }
}

/** Moves a file or category from the `image` tag to `wikimedia_commons` */
function moveImageFix(entityId: string, reference: string) {
  return {
    id: 'move_value_to_wikimedia_commons',
    label: 'Set image as from Wikimedia Commons',
    annotation: 'Set image as from Wikimedia Commons',
    actions: (graph: Graph) => {
      const entity = graph.hasEntity(entityId)
      if (!entity) return []
      const tags: Record<string, string> = {
        ...entity.tags,
        wikimedia_commons: reference,
      }
      delete tags.image
      return [actionChangeTags(entityId, tags)]
    },
  }
}

/** Replaces a Wikimedia Commons URL in `wikimedia_commons` by the file or category name */
function upgradeFix(entityId: string, value: string) {
  return {
    id: 'upgrade_tags',
    label: 'Accept the suggested updates',
    annotation: 'Accepted the suggested updates',
    actions: (graph: Graph) => {
      const entity = graph.hasEntity(entityId)
      if (!entity) return []
      return [actionChangeTags(entityId, { ...entity.tags, wikimedia_commons: value })]
    },
  }
}

/**
 * Malformed website, image and other URL tags, malformed emails, and Wikimedia Commons tags that
 * hold a URL or a file name in the wrong tag. The fixes add a protocol where the value is a domain
 * (one URL only), move a file name from `image` to `wikimedia_commons`, or take the file name out
 * of a Wikimedia Commons URL.
 */
export const invalidFormat: Rule = {
  id: 'invalid_format',
  label: 'Invalid formatting',
  validate(entity: OsmEntity) {
    const tags = entity.tags
    const name = tags.name || 'This feature'
    const issues: Issue[] = []

    for (const [key, value] of Object.entries(tags)) {
      if (!urlKeys.has(key) || !value?.trim()) continue
      // An image that is a Wikimedia Commons reference is reported below, not as a website
      if (key === 'image' && wikimediaReferenceOf(value, tags)) continue

      const parts = value.split(';').map((part) => part.trim())
      const invalidParts = parts.filter((part) => !isValidURL(part))
      if (invalidParts.length === 0) continue

      const count = invalidParts.length
      const isFixable = invalidParts.some(isFixableURL)
      const fixValue = parts
        .map((part) => (isValidURL(part) || !isFixableURL(part) ? part : `{protocol}://${part}`))
        .join(';')
      const fixes: Fix[] = []
      if (count === 1 && isFixable) {
        for (const protocol of ['https', 'http']) {
          if (isValidURL(`${protocol}://${invalidParts[0]}`, true)) {
            fixes.push(protocolFix(entity.id, key, fixValue, protocol))
          }
        }
      }
      issues.push({
        id: `invalid_format:${entity.id}:${key}`,
        rule: 'invalid_format',
        severity: 'warning',
        message: `${name} has ${count > 1 ? 'multiple invalid URLs' : 'an invalid URL'} in ${key}`,
        entityIds: [entity.id],
        fixes,
        data: { key, isFixable, fix: fixValue, count },
      })
    }

    const image = tags.image
    const imageReference = image ? wikimediaReferenceOf(image, tags) : undefined
    if (image && imageReference) {
      issues.push({
        id: `invalid_format:${entity.id}:wikimedia_commons`,
        rule: 'invalid_format',
        severity: 'warning',
        message: `${name} has a suspicious Wikimedia Commons tag`,
        entityIds: [entity.id],
        fixes: [moveImageFix(entity.id, imageReference)],
        data: { key: 'image', fix: imageReference },
      })
    }

    const commons = tags.wikimedia_commons
    if (commons && isValidURL(commons, true)) {
      // A URL in wikimedia_commons is wrong: the file or category name is what belongs there
      const url = new URL(commons)
      const match = /\/wiki\/(File|Category)(:|%3A)(.*)/.exec(url.pathname)
      if (url.host === 'commons.wikimedia.org' && match) {
        const value = decodeURIComponent(`${match[1]}:${match[3]}`).replace(/_/g, ' ')
        issues.push({
          id: `invalid_format:${entity.id}:wikimedia_commons_url`,
          rule: 'invalid_format',
          severity: 'warning',
          message: `${name} has a suspicious Wikimedia Commons tag`,
          entityIds: [entity.id],
          fixes: [upgradeFix(entity.id, value)],
          data: { value },
        })
      }
    }

    if (tags.email) {
      // Several addresses are separated by semicolons
      const invalid = tags.email
        .split(';')
        .map((part) => part.trim())
        .filter((part) => !isValidEmail(part))
      if (invalid.length > 0) {
        issues.push({
          id: `invalid_format:${entity.id}:email`,
          rule: 'invalid_format',
          severity: 'warning',
          message: `${name} has ${invalid.length > 1 ? 'multiple invalid email addresses' : 'an invalid email address'}`,
          entityIds: [entity.id],
          fixes: [],
          data: { emails: invalid },
        })
      }
    }

    return issues
  },
}
