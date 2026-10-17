/**
 * Runs the browser checks one after another against one app, and writes one report. A check of a module runs
 * only for the app that has the module (parking; way table and reroute in bicycle).
 *
 *   bun run check-all [--app maid|bicycle|parking]
 *
 * Each check is started as `bun run check-<name> --app <app>` and must exit 0 with at least the
 * expected number of `ok` lines. Prints one line per check, then its FAIL lines. Writes
 * reports/check-all-<app>.json (per check: exit code, ok count, FAIL lines, seconds, log file) and
 * the full output of each check in reports/check-all-<app>/<name>.log. Exits 1 if a check failed.
 *
 * The checks need `bun run dev` running (the dev servers and the mock API). This script starts nothing.
 */
import { mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { APPS, type AppName, takeApp } from '../bench/args'

const ROOT = join(import.meta.dir, '..', '..')

/** The browser checks, in the order they run */
const CHECKS = [
  'interactions',
  'edit',
  'draw',
  'undo',
  'ops',
  'relations',
  'relation-column',
  'validation',
  'journal',
  'filters',
  'tags',
  'multi',
  'parking',
  'way-table',
  'reroute',
  'rectangle',
  'angle-snap',
  'merge',
  'cut',
  'divide',
  'display',
  'touch',
  'menu',
  'merge-polygon',
  'favourites',
  'tooltips',
] as const
type CheckName = (typeof CHECKS)[number]

/** Checks of a module: they run only for the app that switches it on (`only` in RUNS) */
const MODULE_CHECKS = new Set<CheckName>([
  'parking',
  'way-table',
  'reroute',
  'rectangle',
  'angle-snap',
  'merge',
  'cut',
  'divide',
  'touch',
])

/** Checks that need the relations scene (routes with route masters), for every app */
const RELATIONS_SCENE_CHECKS = new Set<CheckName>(['relation-column'])

/** A run of a check: its name in the report, the check, a scene other than the default (small), the one app it runs for */
type Run = { name: string; check: CheckName; scene?: string; only?: AppName }

/** The checks of the shell on the default scene, the relation check on the scene made for relations, the module checks */
const RUNS: Run[] = [
  ...CHECKS.filter((check) => !MODULE_CHECKS.has(check) && !RELATIONS_SCENE_CHECKS.has(check)).map(
    (check) => ({ name: check, check }),
  ),
  { name: 'relations-scene', check: 'relations', scene: 'relations' },
  { name: 'relation-column', check: 'relation-column', scene: 'relations' },
  { name: 'parking', check: 'parking', only: 'parking' },
  { name: 'way-table', check: 'way-table', scene: 'relations', only: 'bicycle' },
  { name: 'reroute', check: 'reroute', scene: 'relations', only: 'bicycle' },
  // the drawing tools of module-shapes, on in the parking app
  { name: 'rectangle', check: 'rectangle', only: 'parking' },
  { name: 'angle-snap', check: 'angle-snap', only: 'parking' },
  { name: 'merge', check: 'merge', only: 'parking' },
  { name: 'cut', check: 'cut', only: 'parking' },
  { name: 'divide', check: 'divide', only: 'parking' },
  // long press on a touch screen: the Area dropdown, the edit menu, Shift while drawing (it needs the rectangle tool)
  { name: 'touch', check: 'touch', only: 'parking' },
]

/**
 * The `ok` lines each check prints on the default scene (small) when it passes, per app. A check
 * with fewer `ok` lines fails. With more, it passes, and the run prints a note: update this table.
 * Bicycle and parking have the same numbers until a real run says otherwise.
 */
const EXPECTED_OK: Record<string, Record<AppName, number>> = {
  interactions: { maid: 160, bicycle: 160, parking: 160 },
  edit: { maid: 20, bicycle: 20, parking: 20 },
  draw: { maid: 14, bicycle: 14, parking: 14 },
  undo: { maid: 43, bicycle: 43, parking: 43 },
  ops: { maid: 17, bicycle: 17, parking: 17 },
  relations: { maid: 21, bicycle: 21, parking: 21 },
  validation: { maid: 8, bicycle: 8, parking: 8 },
  journal: { maid: 17, bicycle: 17, parking: 17 },
  filters: { maid: 19, bicycle: 19, parking: 19 },
  tags: { maid: 23, bicycle: 23, parking: 23 },
  multi: { maid: 11, bicycle: 11, parking: 11 },
  'relations-scene': { maid: 25, bicycle: 25, parking: 25 },
  'relation-column': { maid: 31, bicycle: 31, parking: 31 },
  // module checks run for one app only (`only` in RUNS): the count is 0 elsewhere
  parking: { maid: 0, bicycle: 0, parking: 29 },
  'way-table': { maid: 0, bicycle: 13, parking: 0 },
  reroute: { maid: 0, bicycle: 12, parking: 0 },
  rectangle: { maid: 0, bicycle: 0, parking: 24 },
  'angle-snap': { maid: 0, bicycle: 0, parking: 35 },
  merge: { maid: 0, bicycle: 0, parking: 29 },
  cut: { maid: 0, bicycle: 0, parking: 25 },
  divide: { maid: 0, bicycle: 0, parking: 23 },
  display: { maid: 12, bicycle: 12, parking: 12 },
  touch: { maid: 0, bicycle: 0, parking: 14 },
  menu: { maid: 12, bicycle: 12, parking: 12 },
  'merge-polygon': { maid: 23, bicycle: 23, parking: 23 },
  favourites: { maid: 13, bicycle: 13, parking: 13 },
  tooltips: { maid: 11, bicycle: 11, parking: 11 },
}

type CheckResult = {
  name: string
  exitCode: number
  okCount: number
  expectedOk: number
  /** pass: exit 0 and at least the expected ok lines */
  status: 'pass' | 'fail'
  failLines: string[]
  /** Set when the check printed more ok lines than expected: update EXPECTED_OK */
  note?: string
  /** The last lines of stderr, when the check failed without a FAIL line (a crash, an aborted run) */
  stderrTail?: string[]
  seconds: number
  log: string
}

const app = takeApp()
const outDir = join(ROOT, 'reports', `check-all-${app}`)
const reportPath = join(ROOT, 'reports', `check-all-${app}.json`)
await mkdir(outDir, { recursive: true })

const startedAt = new Date()
const results: CheckResult[] = []

for (const { name, check, scene, only } of RUNS) {
  if (only && only !== app) continue
  const expectedOk = EXPECTED_OK[name]?.[app] ?? 0
  const began = performance.now()
  const args = scene ? [`check-${check}`, scene, '--app', app] : [`check-${check}`, '--app', app]
  const proc = Bun.spawn([process.execPath, 'run', ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  const seconds = Math.round((performance.now() - began) / 100) / 10

  const lines = stdout.split('\n')
  const okCount = lines.filter((line) => line.startsWith('ok ')).length
  const failLines = lines.filter((line) => line.startsWith('FAIL ')).map((line) => line.trimEnd())
  const log = join(outDir, `${name}.log`)
  await Bun.write(log, `${stdout}${stderr ? `\n--- stderr ---\n${stderr}` : ''}`)

  const passed = exitCode === 0 && okCount >= expectedOk
  const result: CheckResult = {
    name,
    exitCode,
    okCount,
    expectedOk,
    status: passed ? 'pass' : 'fail',
    failLines,
    seconds,
    log: relative(ROOT, log),
  }
  if (okCount > expectedOk) {
    result.note = `ok=${okCount} is above the expected ${expectedOk}: update EXPECTED_OK in tools/checks/check-all.ts`
  }
  if (!passed && failLines.length === 0) {
    result.stderrTail = stderr.trimEnd().split('\n').slice(-8)
  }
  results.push(result)

  console.log(`${name} exit=${exitCode} ok=${okCount} (expected ${expectedOk}) ${seconds}s`)
  for (const line of failLines) console.log(`  ${line}`)
  if (!passed && failLines.length === 0) {
    console.log(`  no FAIL line; the run ended early or crashed. Last stderr lines:`)
    for (const line of result.stderrTail ?? []) console.log(`    ${line}`)
  }
  if (okCount < expectedOk) console.log(`  fewer ok lines than expected`)
  if (result.note) console.log(`  note: ${result.note}`)
}

const failed = results.filter((r) => r.status === 'fail').length
const report = {
  app,
  port: APPS[app].port,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  passed: failed === 0,
  checks: results,
}
await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `check-all ${app}: ${results.length - failed} of ${results.length} passed. Report: ${relative(ROOT, reportPath)}`,
)
process.exit(failed === 0 ? 0 : 1)
