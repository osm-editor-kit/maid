/**
 * `bun run i18n-check`: which texts each language lacks, as JSON (decision 7 of ADR 0009). It checks the app's texts
 * (packages/i18n) and the texts of each module that has its own inlang project (projects.ts).
 *
 * The base language (`baseLocale` of the project's settings, English) is the reference. For every other language it
 * lists the keys that are missing or empty (`missing`, with the base text), the keys that the base does not have
 * (`extra`), and the keys whose `{name}` placeholders differ from the base (`placeholderMismatch`). The app's result
 * is at the top level of the report, as before; each module's is under `modules` by its package name.
 * Writes `reports/i18n-missing.json` and prints the same. Exits 1 when a key lacks a language or a placeholder
 * differs, so the check fails. No network, no machine translation.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECTS, type Project } from './projects.ts'

const REPORT = join(import.meta.dir, '..', '..', '..', 'reports', 'i18n-missing.json')

type Messages = Record<string, string>

function load(project: Project, locale: string): Messages {
  const file = join(project.dir, 'messages', `${locale}.json`)
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

function checkProject(project: Project) {
  const settings = JSON.parse(
    readFileSync(join(project.dir, 'project.inlang', 'settings.json'), 'utf8'),
  ) as { baseLocale: string; locales: string[] }
  const base = settings.baseLocale
  const others = settings.locales.filter((locale) => locale !== base)
  const english = load(project, base)
  const keys = Object.keys(english)
  const found = readdirSync(join(project.dir, 'messages'))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))

  const locales = Object.fromEntries(
    others.map((locale) => {
      const texts = found.includes(locale) ? load(project, locale) : {}
      const missing = keys
        .filter((key) => (texts[key] ?? '').trim() === '')
        .map((key) => ({ key, [base]: english[key] }))
      const extra = Object.keys(texts).filter((key) => !(key in english))
      const placeholderMismatch = keys
        .filter((key) => key in texts && (texts[key] ?? '').trim() !== '')
        .filter(
          (key) =>
            placeholders(english[key] ?? '').join() !== placeholders(texts[key] ?? '').join(),
        )
        .map((key) => ({
          key,
          [base]: placeholders(english[key] ?? ''),
          [locale]: placeholders(texts[key] ?? ''),
        }))
      return [locale, { missing, extra, placeholderMismatch }]
    }),
  )

  const problems = Object.values(locales).reduce(
    (sum, entry) => sum + entry.missing.length + entry.placeholderMismatch.length,
    0,
  )
  return { base, keys: keys.length, locales, problems, ok: problems === 0 }
}

const results = PROJECTS.map((project) => ({ project, result: checkProject(project) }))
const [app, ...modules] = results
if (!app) throw new Error('i18n: no project')

const output = {
  ...app.result,
  modules: Object.fromEntries(modules.map(({ project, result }) => [project.name, result])),
  ok: results.every(({ result }) => result.ok),
}
const problems = results.reduce((sum, { result }) => sum + result.problems, 0)

mkdirSync(join(REPORT, '..'), { recursive: true })
writeFileSync(REPORT, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify(output, null, 2))
console.error(
  `i18n: ${problems === 0 ? 'every key has every language' : `${problems} problem(s)`} in ${results.map(({ project }) => project.name).join(', ')}; written to ${REPORT}`,
)
process.exit(problems === 0 ? 0 : 1)
