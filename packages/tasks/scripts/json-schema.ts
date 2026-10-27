/**
 * Writes `packages/tasks/task-file.schema.json`: the JSON Schema of the task file, for editors and for people who
 * generate task files. The output is formatted with the repository's formatter, so it is commit-ready.
 * Run: `bun packages/tasks/scripts/json-schema.ts`.
 */
import { join } from 'node:path'
import { taskFileJsonSchema } from '../src/json-schema.ts'

const repo = join(import.meta.dir, '..', '..', '..')
const out = join(import.meta.dir, '..', 'task-file.schema.json')
await Bun.write(out, `${JSON.stringify(taskFileJsonSchema(), null, 2)}\n`)

const format = Bun.spawnSync(
  ['bunx', 'oxfmt', '--write', '-c', join(repo, 'oxfmt.config.mjs'), out],
  { cwd: repo, stdout: 'pipe', stderr: 'pipe' },
)
if (format.exitCode !== 0) {
  console.error(format.stderr.toString())
  process.exit(format.exitCode)
}
console.log(`Wrote ${out}`)
