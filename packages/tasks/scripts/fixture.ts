/**
 * Writes `fixtures/tasks/small.tasks.geojson`: 40 tasks cut from the `small` OSM fixture, with a fixed seed, so the
 * same bytes come out on every run. The output is checked against the format before it is written.
 * Run: `bun run tasks-fixture`.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type FixtureElement, generateTasks } from '../src/fixture.ts'
import { parseTaskFile } from '../src/parse.ts'

/** The seed of the committed fixture. Changing it is a reviewed change to the fixture. */
const SEED = 20261027
const COUNT = 40

const repo = join(import.meta.dir, '..', '..', '..')
const gz = await Bun.file(join(repo, 'fixtures', 'small.json.gz')).arrayBuffer()
const scene = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(gz)))) as {
  elements: FixtureElement[]
}

const file = generateTasks({ seed: SEED, count: COUNT, elements: scene.elements })
const checked = parseTaskFile(file)
if (!checked.ok) {
  for (const error of checked.errors) console.error(`${error.path}: ${error.message}`)
  console.error('The generated fixture does not match the task format.')
  process.exit(1)
}

const out = join(repo, 'fixtures', 'tasks', 'small.tasks.geojson')
mkdirSync(dirname(out), { recursive: true })
const text = `${JSON.stringify(file, null, 2)}\n`
await Bun.write(out, text)
console.log(`Wrote ${out}: ${COUNT} tasks, ${text.length} bytes`)
