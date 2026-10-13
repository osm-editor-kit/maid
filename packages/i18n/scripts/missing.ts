/**
 * `bun run i18n-check`: which texts each language lacks, as JSON (decision 7 of ADR 0009).
 *
 * English (`messages/en.json`) is the base. For de, fr and es it lists the keys that are missing or
 * empty (`missing`, with the English text), the keys that English does not have (`extra`), and the
 * keys whose `{name}` placeholders differ from English (`placeholderMismatch`). Writes
 * `reports/i18n-missing.json` and prints the same. Exits 1 when a key lacks a language or a
 * placeholder differs, so the check fails. No network, no machine translation.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE = join(import.meta.dir, '..')
const REPORT = join(PACKAGE, '..', '..', 'reports', 'i18n-missing.json')
const BASE = 'en'
const LANGUAGES = ['de', 'fr', 'es']

type Messages = Record<string, string>

function load(locale: string): Messages {
  const file = join(PACKAGE, 'messages', `${locale}.json`)
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const messages: Messages = {}
  // `$schema` and other keys starting with `$` are not texts
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('$') && typeof value === 'string') messages[key] = value
  }
  return messages
}

/** The `{name}` placeholders of a text, sorted */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1] ?? '').sort()
}

const english = load(BASE)
const keys = Object.keys(english)
const found = readdirSync(join(PACKAGE, 'messages'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort()

const report = {
  base: BASE,
  keys: keys.length,
  locales: Object.fromEntries(
    LANGUAGES.map((locale) => {
      const texts = found.includes(locale) ? load(locale) : {}
      const missing = keys
        .filter((key) => (texts[key] ?? '').trim() === '')
        .map((key) => ({ key, [BASE]: english[key] }))
      const extra = Object.keys(texts).filter((key) => !(key in english))
      const placeholderMismatch = keys
        .filter((key) => key in texts && (texts[key] ?? '').trim() !== '')
        .filter(
          (key) =>
            placeholders(english[key] ?? '').join() !== placeholders(texts[key] ?? '').join(),
        )
        .map((key) => ({
          key,
          [BASE]: placeholders(english[key] ?? ''),
          [locale]: placeholders(texts[key] ?? ''),
        }))
      return [locale, { missing, extra, placeholderMismatch }]
    }),
  ),
}

const problems = Object.values(report.locales).reduce(
  (sum, entry) => sum + entry.missing.length + entry.placeholderMismatch.length,
  0,
)
const output = { ...report, ok: problems === 0 }

mkdirSync(join(PACKAGE, '..', '..', 'reports'), { recursive: true })
writeFileSync(REPORT, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify(output, null, 2))
console.error(
  `i18n: ${problems === 0 ? 'every key has every language' : `${problems} problem(s)`}; written to ${REPORT}`,
)
process.exit(problems === 0 ? 0 : 1)
