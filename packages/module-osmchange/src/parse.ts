/**
 * Reading an osmChange file (https://wiki.openstreetmap.org/wiki/OsmChange). Its own small XML reader instead of
 * `DOMParser`: the format is elements and attributes only, the same code runs in the tests (bun has no DOMParser),
 * and a file of ten thousand elements is read without building a DOM.
 *
 * The file is refused as a whole when anything in it is wrong: a partly loaded file would be worse than none.
 */
import {
  type ChangeAction,
  type ElementType,
  type FileChange,
  keyOf,
  type Member,
  type Message,
  type OsmChangeFile,
} from './types.ts'

/** The most elements a file may have: the API's `maximum_elements` of a changeset, which Maid's save enforces */
export const MAX_ELEMENTS = 10_000

export type ParseResult =
  | { readonly ok: true; readonly file: OsmChangeFile }
  | { readonly ok: false; readonly error: Message }

type XmlElement = { name: string; attributes: Record<string, string>; children: XmlElement[] }

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g
const ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const ENTITY = /&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(value: string) {
  return value.replace(
    ENTITY,
    (_, hex: string | undefined, dec: string | undefined, name?: string) =>
      hex !== undefined
        ? String.fromCodePoint(Number.parseInt(hex, 16))
        : dec !== undefined
          ? String.fromCodePoint(Number(dec))
          : (NAMED[name ?? ''] ?? ''),
  )
}

/** The root element, or undefined when the text is not well-formed in the ways this reader can tell */
function readXml(text: string): XmlElement | undefined {
  const root: XmlElement = { name: '#document', attributes: {}, children: [] }
  const open: XmlElement[] = [root]
  for (const [, closing, opening, attributeText, selfClosing, , stray] of text.matchAll(TOKEN)) {
    if (stray !== undefined) return undefined
    const parent = open.at(-1)!
    if (closing !== undefined) {
      if (open.length === 1 || parent.name !== closing) return undefined
      open.pop()
    } else if (opening !== undefined) {
      const attributes: Record<string, string> = {}
      for (const [, name, double, single] of (attributeText ?? '').matchAll(ATTRIBUTE)) {
        attributes[name!] = decode(double ?? single ?? '')
      }
      const element: XmlElement = { name: opening, attributes, children: [] }
      parent.children.push(element)
      if (!selfClosing) open.push(element)
    }
  }
  if (open.length !== 1 || root.children.length !== 1) return undefined
  return root.children[0]
}

const ACTIONS = new Set<string>(['create', 'modify', 'delete'])
const TYPES = new Set<string>(['node', 'way', 'relation'])

class ParseError extends Error {
  constructor(readonly error: Message) {
    super(error.id)
  }
}

function fail(id: string, values?: Record<string, string | number>): never {
  throw new ParseError({ id, values })
}

function integer(value: string | undefined) {
  if (value === undefined || !/^-?\d+$/.test(value.trim())) return undefined
  return Number(value)
}

function readElement(action: ChangeAction, xml: XmlElement): FileChange['element'] {
  const type = xml.name as ElementType
  const id = integer(xml.attributes.id)
  if (id === undefined || id === 0) fail('osmchange_error_id', { type })
  const key = keyOf(type, id)
  if (action === 'create' && id > 0) fail('osmchange_error_create_id', { id: key })
  if (action !== 'create' && id < 0) fail('osmchange_error_existing_id', { id: key })
  const version = integer(xml.attributes.version)
  const tags: Record<string, string> = {}
  const nodes: number[] = []
  const members: Member[] = []
  for (const child of xml.children) {
    if (child.name === 'tag') {
      const k = child.attributes.k
      if (k === undefined || child.attributes.v === undefined)
        fail('osmchange_error_tag', { id: key })
      tags[k] = child.attributes.v
    } else if (child.name === 'nd' && type === 'way') {
      const ref = integer(child.attributes.ref)
      if (ref === undefined || ref === 0) fail('osmchange_error_reference', { id: key })
      nodes.push(ref)
    } else if (child.name === 'member' && type === 'relation') {
      const ref = integer(child.attributes.ref)
      const memberType = child.attributes.type ?? ''
      if (ref === undefined || ref === 0 || !TYPES.has(memberType))
        fail('osmchange_error_reference', { id: key })
      members.push({ type: memberType as ElementType, ref, role: child.attributes.role ?? '' })
    } else {
      fail('osmchange_error_element', { name: child.name })
    }
  }
  // a version of 0 is how a new element is written; it says nothing about a base
  const known = version !== undefined && version > 0 ? { version } : {}
  if (type === 'node') {
    const lat = Number(xml.attributes.lat)
    const lon = Number(xml.attributes.lon)
    // a deleted node may come without its position (JOSM writes them with one, osmium without)
    if (action === 'delete' && xml.attributes.lat === undefined) return { type, id, ...known, tags }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      fail('osmchange_error_position', { id: key })
    return { type, id, ...known, tags, lat, lon }
  }
  if (type === 'way') {
    if (action !== 'delete' && nodes.length < 2) fail('osmchange_error_way_nodes', { id: key })
    return { type, id, ...known, tags, nodes }
  }
  return { type, id, ...known, tags, members }
}

/** Reads the text of an osmChange file. Refuses the whole file on the first problem, with a message to show. */
export function parseOsmChange(text: string): ParseResult {
  try {
    const root = readXml(text)
    if (!root) fail('osmchange_error_xml')
    if (root.name !== 'osmChange') fail('osmchange_error_not_osmchange')
    const changes: FileChange[] = []
    const seen = new Set<string>()
    for (const block of root.children) {
      if (!ACTIONS.has(block.name)) fail('osmchange_error_element', { name: block.name })
      const action = block.name as ChangeAction
      const ifUnused = action === 'delete' && block.attributes['if-unused'] !== undefined
      for (const xml of block.children) {
        if (!TYPES.has(xml.name)) fail('osmchange_error_element', { name: xml.name })
        const element = readElement(action, xml)
        const key = keyOf(element.type, element.id)
        if (seen.has(key)) fail('osmchange_error_twice', { id: key })
        seen.add(key)
        const { timestamp } = xml.attributes
        changes.push({ action, element, ifUnused, ...(timestamp ? { timestamp } : {}) })
        if (changes.length > MAX_ELEMENTS) fail('osmchange_error_too_many', { max: MAX_ELEMENTS })
      }
    }
    if (changes.length === 0) fail('osmchange_error_empty')
    // a new element can only be referred to when the file creates it
    for (const { element } of changes) {
      const refs = [
        ...(element.nodes ?? []).map((ref) => keyOf('node', ref)),
        ...(element.members ?? []).map((member) => keyOf(member.type, member.ref)),
      ]
      for (const ref of refs) {
        if (ref.includes('-') && !seen.has(ref)) fail('osmchange_error_new_reference', { id: ref })
      }
    }
    const generator = root.attributes.generator
    return { ok: true, file: { ...(generator ? { generator } : {}), changes } }
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, error: error.error }
    throw error
  }
}
