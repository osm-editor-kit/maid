import { readdirSync } from 'node:fs'
/**
 * Budget check for benchmark runs. Reads results.json; needs no browser.
 *
 *   bun run bench-budget [run-id ...]           check (default: the latest run)
 *   bun run bench-budget <run-id> --update      write tools/bench/budget.json from that run's Maid results
 *
 * Several run ids are merged the way bench-report merges them: each editor's column comes from the first run that has
 * it, so `bench-budget <maid-run> <other-run>` checks Maid from the first run and iD and Rapid from the second.
 *
 * Two kinds of line, per scene and measurement (rows are in tools/bench/metrics.ts):
 *  - FAIL (exit code 1): Maid is slower than iD or Rapid on that measurement. This is the crisis the budget guards.
 *    Load is compared on "Loaded: map drawn" (drawnMs) only; "Loaded: everything fetched" is a warning, never a FAIL.
 *    Measured against the same run's other editors. A difference counts only when it is above the noise floor:
 *    5 % of the other editor's value and at least 1 unit (1 ms, 1 MB, 1 frame per second). Frame times of 16.7 and
 *    16.8 ms are the same frame; they are reported as ties, not as failures.
 *  - WARN (exit code stays 0): Maid is slower than its own baseline in tools/bench/budget.json by more than the
 *    tolerance of that measurement (15 % unless the file says otherwise). Warnings never fail a run.
 *
 * Writes reports/<first run>/budget-check.json (the lines and the table) and prints the same table and lines.
 */
import { join } from 'node:path'
import { columnOf, ROWS, type Row } from './metrics'
import type { RunResult } from './run'
import { median } from './stats'

const ROOT = join(import.meta.dir, '../..')
const reportsDir = join(ROOT, 'reports')
const budgetFile = join(import.meta.dir, 'budget.json')
const OTHERS = ['id', 'rapid'] as const
const SCENE_ORDER = ['small', 'medium', 'dense']

type Baseline = {
  version: 1
  run: string
  git: string
  date: string
  defaultTolerance: number
  scenes: Record<string, Record<string, { median: number; tolerance?: number }>>
}

type RunFile = { environment: any; results: RunResult[] }

const argv = process.argv.slice(2)
const update = argv.includes('--update')
let runIds = argv.filter((a) => !a.startsWith('--'))
if (runIds.length === 0) {
  const all = readdirSync(reportsDir)
    .filter((d) => /^\d{4}-/.test(d))
    .sort()
  runIds = [all[all.length - 1]!]
}
const runs: (RunFile & { id: string })[] = await Promise.all(
  runIds.map(async (id) => ({
    id,
    ...((await Bun.file(join(reportsDir, id, 'results.json')).json()) as RunFile),
  })),
)

// the run each column comes from: the first run (in the order given) that has it
const chosen = new Map<string, number>()
runs.forEach((run, index) => {
  for (const r of run.results) {
    const column = columnOf(r)
    if (!chosen.has(column)) chosen.set(column, index)
  }
})

/** The median over the repetitions that ran fine, from the run the column comes from. undefined when none did. */
function valueOf(column: string, scene: string, row: Row): number | undefined {
  const index = chosen.get(column)
  if (index === undefined) return undefined
  const values = runs[index]!.results.filter(
    (r) => columnOf(r) === column && r.scene === scene && r.ok,
  )
    .map(row.get)
    .filter((v): v is number => v != null && !Number.isNaN(v))
  return values.length ? median(values) : undefined
}

const sceneRank = (scene: string) => (SCENE_ORDER.includes(scene) ? SCENE_ORDER.indexOf(scene) : 99)
const scenes = [...new Set(runs.flatMap((run) => run.results.map((r) => r.scene)))].sort(
  (a, b) => sceneRank(a) - sceneRank(b) || a.localeCompare(b),
)
const round1 = (n: number) => Math.round(n * 10) / 10

if (update) {
  const maidIndex = chosen.get('maid')
  if (maidIndex === undefined) {
    console.error('The runs have no Maid results: nothing to write to budget.json')
    process.exit(2)
  }
  const maidRun = runs[maidIndex]!
  const previous = (await Bun.file(budgetFile)
    .json()
    .catch(() => undefined)) as Baseline | undefined
  const next: Baseline = {
    version: 1,
    run: maidRun.id,
    git: maidRun.environment.git,
    date: maidRun.environment.date,
    defaultTolerance: previous?.defaultTolerance ?? 0.15,
    scenes: {},
  }
  for (const scene of scenes) {
    for (const row of ROWS) {
      const value = valueOf('maid', scene, row)
      if (value === undefined) continue
      const tolerance = previous?.scenes[scene]?.[row.id]?.tolerance
      ;(next.scenes[scene] ??= {})[row.id] = {
        median: round1(value),
        ...(tolerance !== undefined ? { tolerance } : {}),
      }
    }
  }
  await Bun.write(budgetFile, JSON.stringify(next, null, 2) + '\n')
  console.log(`wrote ${budgetFile} from ${maidRun.id}`)
  process.exit(0)
}

const baseline = (await Bun.file(budgetFile)
  .json()
  .catch(() => undefined)) as Baseline | undefined
const defaultTolerance = baseline?.defaultTolerance ?? 0.15

const fails: string[] = []
const warns: string[] = []
const table: {
  scene: string
  metric: string
  label: string
  unit: string
  maid?: number
  iD?: number
  rapid?: number
  baseline?: number
  verdict: string
}[] = []

for (const scene of scenes) {
  for (const row of ROWS) {
    const maid = valueOf('maid', scene, row)
    const others = OTHERS.map((name) => ({ name, value: valueOf(name, scene, row) }))
    const base = baseline?.scenes[scene]?.[row.id]
    const verdicts: string[] = []
    if (row.compare !== false && row.better !== 'none' && maid !== undefined) {
      for (const other of others) {
        if (other.value === undefined) continue
        // slower by more than the noise floor: 5 % of the other value and one unit (see the header)
        const floor = Math.max(1, 0.05 * Math.abs(other.value))
        const gap = row.better === 'low' ? maid - other.value : other.value - maid
        if (gap <= floor) continue
        const unit = row.unit ? ` ${row.unit}` : ''
        const line = `FAIL ${scene} ${row.id}: Maid ${round1(maid)}${unit} against ${other.name} ${round1(other.value)}${unit}: ${round1(gap)}${unit} ${row.better === 'low' ? 'slower' : 'lower'}`
        fails.push(line)
        verdicts.push(`FAIL vs ${other.name}`)
      }
    }
    if (base && row.better !== 'none' && maid !== undefined) {
      const tolerance = base.tolerance ?? defaultTolerance
      const worse =
        row.better === 'low'
          ? maid > base.median * (1 + tolerance)
          : maid < base.median * (1 - tolerance)
      if (worse) {
        const change = Math.round(((maid - base.median) / base.median) * 100)
        const line = `WARN ${scene} ${row.id}: Maid ${round1(maid)} against its baseline ${base.median}${row.unit ? ` ${row.unit}` : ''} (${change > 0 ? '+' : ''}${change} %, tolerance ${Math.round(tolerance * 100)} %)`
        warns.push(line)
        verdicts.push('WARN baseline')
      }
    }
    if (maid === undefined && others.every((o) => o.value === undefined)) continue
    table.push({
      scene,
      metric: row.id,
      label: row.label,
      unit: row.unit,
      maid: maid === undefined ? undefined : round1(maid),
      iD: others[0]!.value === undefined ? undefined : round1(others[0]!.value),
      rapid: others[1]!.value === undefined ? undefined : round1(others[1]!.value),
      baseline: base?.median,
      verdict: verdicts.length
        ? verdicts.join(', ')
        : maid === undefined
          ? 'not measured for Maid'
          : 'ok',
    })
  }
}

const out = {
  runs: runIds,
  columns: Object.fromEntries(chosen.entries()),
  tolerance: defaultTolerance,
  fails,
  warns,
  table,
}
const outFile = join(reportsDir, runs[0]!.id, 'budget-check.json')
await Bun.write(outFile, JSON.stringify(out, null, 2) + '\n')

// the same table as text, per scene
for (const scene of scenes) {
  console.log(`\n${scene}`)
  console.log(
    `${'measurement'.padEnd(58)} ${'maid'.padStart(9)} ${'iD'.padStart(9)} ${'rapid'.padStart(9)} ${'baseline'.padStart(9)}  verdict`,
  )
  for (const t of table.filter((x) => x.scene === scene)) {
    const cellOf = (v: number | undefined) => (v === undefined ? '–' : String(v)).padStart(9)
    console.log(
      `${`${t.label}${t.unit ? ` (${t.unit})` : ''}`.slice(0, 58).padEnd(58)} ${cellOf(t.maid)} ${cellOf(t.iD)} ${cellOf(t.rapid)} ${cellOf(t.baseline)}  ${t.verdict}`,
    )
  }
}
console.log(
  `\n${fails.length} FAIL, ${warns.length} WARN (tolerance ${Math.round(defaultTolerance * 100)} % unless a metric says otherwise)`,
)
for (const line of fails) console.log(line)
for (const line of warns) console.log(line)
console.log(`budget check: ${outFile}`)
process.exit(fails.length ? 1 : 0)
