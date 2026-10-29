/**
 * No text a phone shows talks about keys or a mouse. For each message of every project and language this takes the
 * text a touch device gets (the first variant that matches `input=touch` and the device's system, as Paraglide
 * chooses) and looks for the words of a keyboard or a mouse. A text that needs them gets a touch variant
 * (README.md, "Texts for a device"); one that is right as it is goes into ALLOWED with the reason.
 */
import { describe, expect, test } from 'bun:test'
import { PROJECTS } from '../scripts/projects.ts'
import { loadMessages, type Variants } from '../scripts/texts.ts'
import { DEVICE_OSES } from './device.ts'

/**
 * The words of a keyboard or a mouse, by language, as whole words: German "Schalte" holds "halte", and French
 * "touche" is a key and "touches" (it touches), so French only counts "la touche" and "les touches".
 * German "tippe" is left out: it is also "tap".
 */
const WORDS: Record<string, RegExp> = {
  en: /\b(click|clicks|clicking|double-click|right-click|hover|hovering|press|hold|keyboard|shortcuts?|mouse|scroll wheel|type (a|the) (number|key|letter))\b|[⌘⌥⌃⇧]|\b(Ctrl|Alt|Shift)\b/i,
  de: /(^|[^\p{L}])(\p{L}*klick\p{L}*|maus\p{L}*|tasten?|tastatur|tastenkürzel|halte|drücke|mausrad)(?![\p{L}])|[⌘⌥⌃⇧]|\b(Strg|Ctrl|Alt|Shift|Umschalt)\b/iu,
  fr: /\b(clic|cliquez|cliquer|survol\w*|la touche|les touches|clavier|souris|maintenez|appuyez)\b|[⌘⌥⌃⇧]|\b(Ctrl|Alt|Maj|Shift)\b/i,
  es: /\b(clic|haz clic|cursor|tecla|teclas|teclado|ratón|mantén|pulsa)\b|[⌘⌥⌃⇧]|\b(Ctrl|Alt|Mayús|Shift)\b/i,
}

/** Messages that name a key or the mouse on purpose, by `project:key`, with the reason */
const ALLOWED: Record<string, string> = {}

/** Whether a variant's match (`input=touch,os=*`) holds for the inputs */
function holds(match: string, inputs: Record<string, string>) {
  if (match === '') return true
  return match.split(',').every((condition) => {
    const [name = '', value = ''] = condition.split('=')
    return value === '*' || inputs[name] === value
  })
}

/** The texts the message shows on touch devices, one per system, without repeats */
function touchTexts(variants: Variants): string[] {
  const texts = new Set<string>()
  for (const os of DEVICE_OSES) {
    const match = Object.keys(variants).find((each) => holds(each, { input: 'touch', os }))
    if (match !== undefined) texts.add(variants[match] ?? '')
  }
  return [...texts]
}

describe('texts on a touch device', () => {
  for (const project of PROJECTS) {
    const name = project.name
    test(`${name} names no key and no mouse`, () => {
      const found: string[] = []
      for (const [locale, words] of Object.entries(WORDS)) {
        let messages
        try {
          messages = loadMessages(project.dir, locale)
        } catch {
          continue
        }
        for (const [key, variants] of Object.entries(messages)) {
          if (ALLOWED[`${name}:${key}`]) continue
          for (const text of touchTexts(variants)) {
            if (words.test(text)) found.push(`${locale} ${key}: ${text}`)
          }
        }
      }
      expect(found).toEqual([])
    })
  }
})
