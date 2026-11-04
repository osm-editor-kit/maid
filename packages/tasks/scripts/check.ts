/**
 * `bun run tasks-check <file>`: checks a task file against the format and writes `reports/tasks-check.json`
 * (`{ file, ok, tasks, options, errors, omitted }`). Exits 1 on errors or when no file is given. The report path
 * can be changed with the `TASKS_CHECK_REPORT` environment variable (the tests use it).
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseTaskFileText, type TaskFileError } from '../src/parse.ts'

const repo = join(import.meta.dir, '..', '..', '..')
const reportPath = process.env.TASKS_CHECK_REPORT ?? join(repo, 'reports', 'tasks-check.json')

const arg = process.argv[2]
if (arg === undefined || arg === '') {
  console.error('Usage: bun run tasks-check <file.geojson>')
  process.exit(1)
}

const file = resolve(process.cwd(), arg)

let result: ReturnType<typeof parseTaskFileText>
try {
  result = parseTaskFileText(await Bun.file(file).text())
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  result = { ok: false, errors: [{ path: '$', message: `Cannot read the file: ${reason}` }] }
}

const report = {
  file,
  ok: result.ok,
  tasks: result.ok ? result.file.features.length : null,
  options: result.ok
    ? result.file.features.reduce((sum, task) => sum + (task.properties.options?.length ?? 0), 0)
    : null,
  errors: result.ok ? ([] as TaskFileError[]) : result.errors,
  omitted: result.ok ? 0 : (result.omitted ?? 0),
}
mkdirSync(dirname(reportPath), { recursive: true })
await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`)

if (result.ok) {
  console.log(`${file}: valid, ${report.tasks} tasks, ${report.options} options`)
} else {
  console.log(
    `${file}: ${result.errors.length} error(s)${report.omitted ? `, ${report.omitted} more not listed` : ''}`,
  )
  for (const error of result.errors) console.log(`  ${error.path}: ${error.message}`)
}
console.log(`Report: ${reportPath}`)
process.exit(result.ok ? 0 : 1)
