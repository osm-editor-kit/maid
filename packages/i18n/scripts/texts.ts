/**
 * A project's messages as `missing.ts` and the device-word test read them. A message is a plain text, or a list of
 * variants chosen by its selectors (`[{ "selectors": ["input"], "match": { "input=touch": "…", "input=*": "…" } }]`,
 * the inlang message format). Both come out as variants by their match: a plain text is the one variant `''`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A message's texts by their match, `'input=touch'` or `'input=*, os=*'` (spaces taken out); `''` for a plain text */
export type Variants = Record<string, string>

export type Messages = Record<string, Variants>

type Complex = { selectors?: string[]; match?: Record<string, unknown> }

/** The match without its spaces, so that `input=touch, os=ios` and `input=touch,os=ios` are one */
function normalise(match: string) {
  return match.replace(/\s+/g, '')
}

export function loadMessages(dir: string, locale: string): Messages {
  const file = join(dir, 'messages', `${locale}.json`)
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const messages: Messages = {}
  // `$schema` and other keys starting with `$` are not texts
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('$')) continue
    if (typeof value === 'string') messages[key] = { '': value }
    else if (Array.isArray(value)) {
      const variants: Variants = {}
      for (const [match, text] of Object.entries((value[0] as Complex | undefined)?.match ?? {})) {
        if (typeof text === 'string') variants[normalise(match)] = text
      }
      messages[key] = variants
    }
  }
  return messages
}

/** The selectors a message's variants choose by: `['input', 'os']`; none for a plain text */
export function selectorsOf(variants: Variants): string[] {
  const names = new Set<string>()
  for (const match of Object.keys(variants)) {
    for (const part of match.split(',')) {
      const name = part.split('=')[0]
      if (name) names.add(name)
    }
  }
  return [...names].sort()
}
