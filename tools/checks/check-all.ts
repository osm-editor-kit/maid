/**
 * Runs the browser checks one after another against one app, and writes one report. A check of a module runs
 * only for the apps that have the module (parking; way table, reroute and sidepaths in bicycle; levels in indoor; the drawing
 * tools in parking and indoor).
 *
 *   bun run check-all [--app maid|bicycle|parking|indoor|lanes|golf|climbing|buildings|maproulette]
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
  'route-overview',
  'validation',
  'close-nodes',
  'journal',
  'filters',
  'tags',
  'multi',
  'parking',
  'lanes',
  'way-table',
  'reroute',
  'sidepaths',
  'bike-style',
  'rectangle',
  'room',
  'angle-snap',
  'merge',
  'cut',
  'divide',
  'resize',
  'extrude',
  'display',
  'touch',
  'menu',
  'merge-polygon',
  'favourites',
  'move-handle',
  'rotate-handle',
  'tooltips',
  'levels',
  'osmchange',
  'tasks',
  'maproulette',
  'tasking-manager',
] as const
type CheckName = (typeof CHECKS)[number]

/** Checks of a module: they run only for the apps that switch it on (`only` in RUNS) */
const MODULE_CHECKS = new Set<CheckName>([
  'parking',
  'lanes',
  'way-table',
  'reroute',
  'sidepaths',
  'bike-style',
  'rectangle',
  'room',
  'angle-snap',
  'merge',
  'cut',
  'divide',
  'resize',
  'extrude',
  'touch',
  'levels',
  'osmchange',
  'maproulette',
  'tasking-manager',
])

/** Checks that need the relations scene (routes with route masters), for every app */
const RELATIONS_SCENE_CHECKS = new Set<CheckName>(['relation-column', 'route-overview'])

/** A run of a check: its name in the report, the check, a scene other than the default (small), the apps it runs for */
type Run = { name: string; check: CheckName; scene?: string; only?: AppName[] }

/** The checks of the shell on the default scene, the relation check on the scene made for relations, the module checks */
const RUNS: Run[] = [
  ...CHECKS.filter(
    (check) =>
      !MODULE_CHECKS.has(check) && !RELATIONS_SCENE_CHECKS.has(check) && check !== 'filters',
  ).map((check) => ({ name: check, check })),
  // the filters check starts from iD's states (buildings editable); the lanes, golf and buildings apps start with their own
  // focused states, which check-lanes tests (golf and buildings: not yet)
  { name: 'filters', check: 'filters', only: ['maid', 'bicycle', 'parking', 'indoor'] },
  { name: 'relations-scene', check: 'relations', scene: 'relations' },
  { name: 'relation-column', check: 'relation-column', scene: 'relations' },
  { name: 'route-overview', check: 'route-overview', scene: 'relations' },
  { name: 'parking', check: 'parking', only: ['parking'] },
  { name: 'lanes', check: 'lanes', only: ['lanes'] },
  { name: 'way-table', check: 'way-table', scene: 'relations', only: ['bicycle', 'lanes'] },
  { name: 'reroute', check: 'reroute', scene: 'relations', only: ['bicycle'] },
  // module-sidepaths, on in the bicycle app: tags of separately mapped sidewalks move to their way
  { name: 'sidepaths', check: 'sidepaths', scene: 'medium', only: ['bicycle'] },
  // module-bike-infrastructure, the bicycle app's default look: every case of the made-up scene, signs, preset, lenses
  { name: 'bike-style', check: 'bike-style', scene: 'bicycle', only: ['bicycle'] },
  // the drawing tools of module-shapes, on in the parking and the indoor app
  { name: 'rectangle', check: 'rectangle', only: ['parking', 'indoor', 'golf', 'buildings'] },
  { name: 'angle-snap', check: 'angle-snap', only: ['parking', 'indoor', 'golf', 'buildings'] },
  { name: 'merge', check: 'merge', only: ['parking', 'indoor', 'golf', 'buildings'] },
  { name: 'cut', check: 'cut', only: ['parking', 'indoor', 'golf', 'buildings'] },
  { name: 'divide', check: 'divide', only: ['parking', 'indoor', 'buildings'] },
  { name: 'resize', check: 'resize', only: ['parking', 'indoor', 'golf', 'buildings'] },
  // extrude of module-shapes, on in the parking and buildings apps
  { name: 'extrude', check: 'extrude', only: ['parking', 'buildings'] },
  // long press on a touch screen: the Area dropdown, the edit menu, Shift while drawing (it needs the rectangle tool)
  { name: 'touch', check: 'touch', only: ['parking', 'indoor', 'golf', 'buildings'] },
  // the room tool of module-shapes, on in the indoor app: a room drawn into a building on open ground
  { name: 'room', check: 'room', only: ['indoor'] },
  // the level mode of module-levels, on in the indoor app, on the indoor scene (Berlin Hauptbahnhof)
  { name: 'levels', check: 'levels', scene: 'indoor', only: ['indoor'] },
  // module-osmchange, on in the bicycle app: an osmChange file merged with the mock and its hand-written history
  { name: 'osmchange', check: 'osmchange', only: ['bicycle'] },
  // module-maproulette, on in the maproulette app: the mock's made-up challenges, nothing to maproulette.org
  { name: 'maproulette', check: 'maproulette', only: ['maproulette'] },
  // module-tasking-manager, on in the buildings app: the mock's made-up project, nothing to the TM
  { name: 'tasking-manager', check: 'tasking-manager', only: ['buildings'] },
]

/**
 * The `ok` lines each check prints on the default scene (small) when it passes, per app. A check
 * with fewer `ok` lines fails. With more, it passes, and the run prints a note: update this table.
 * Bicycle, parking, indoor, lanes, climbing and maproulette have the same numbers until a real run says otherwise.
 */
const EXPECTED_OK: Record<string, Record<AppName, number>> = {
  interactions: {
    maid: 163,
    bicycle: 163,
    parking: 163,
    indoor: 163,
    lanes: 163,
    golf: 163,
    climbing: 163,
    buildings: 163,
    maproulette: 163,
  },
  edit: {
    maid: 20,
    bicycle: 20,
    parking: 20,
    indoor: 20,
    lanes: 20,
    golf: 20,
    climbing: 20,
    buildings: 20,
    maproulette: 20,
  },
  draw: {
    maid: 14,
    bicycle: 14,
    parking: 14,
    indoor: 14,
    lanes: 14,
    golf: 14,
    climbing: 14,
    buildings: 14,
    maproulette: 14,
  },
  undo: {
    maid: 43,
    bicycle: 43,
    parking: 43,
    indoor: 43,
    lanes: 43,
    golf: 43,
    climbing: 43,
    buildings: 43,
    maproulette: 43,
  },
  ops: {
    maid: 17,
    bicycle: 17,
    parking: 17,
    indoor: 17,
    lanes: 17,
    golf: 17,
    climbing: 17,
    buildings: 17,
    maproulette: 17,
  },
  relations: {
    maid: 21,
    bicycle: 21,
    parking: 21,
    indoor: 21,
    lanes: 21,
    golf: 21,
    climbing: 21,
    buildings: 21,
    maproulette: 21,
  },
  validation: {
    maid: 8,
    bicycle: 8,
    parking: 8,
    indoor: 8,
    lanes: 8,
    golf: 8,
    climbing: 8,
    buildings: 8,
    maproulette: 8,
  },
  'close-nodes': {
    maid: 8,
    bicycle: 8,
    parking: 8,
    indoor: 8,
    lanes: 8,
    golf: 8,
    climbing: 8,
    buildings: 8,
    maproulette: 8,
  },
  journal: {
    maid: 23,
    bicycle: 23,
    parking: 23,
    indoor: 23,
    lanes: 23,
    golf: 23,
    climbing: 23,
    buildings: 23,
    maproulette: 23,
  },
  filters: {
    maid: 21,
    bicycle: 21,
    parking: 21,
    indoor: 21,
    lanes: 0,
    golf: 0,
    climbing: 21,
    buildings: 0,
    maproulette: 21,
  },
  tags: {
    maid: 23,
    bicycle: 23,
    parking: 23,
    indoor: 23,
    lanes: 23,
    golf: 23,
    climbing: 23,
    buildings: 23,
    maproulette: 23,
  },
  multi: {
    maid: 11,
    bicycle: 11,
    parking: 11,
    indoor: 11,
    lanes: 11,
    golf: 11,
    climbing: 11,
    buildings: 11,
    maproulette: 11,
  },
  'relations-scene': {
    maid: 25,
    bicycle: 25,
    parking: 25,
    indoor: 25,
    lanes: 25,
    golf: 25,
    climbing: 25,
    buildings: 25,
    maproulette: 25,
  },
  'relation-column': {
    maid: 37,
    bicycle: 37,
    parking: 37,
    indoor: 37,
    lanes: 37,
    golf: 37,
    climbing: 37,
    buildings: 37,
    maproulette: 37,
  },
  'route-overview': {
    maid: 74,
    bicycle: 74,
    parking: 74,
    indoor: 74,
    lanes: 74,
    golf: 74,
    climbing: 74,
    buildings: 74,
    maproulette: 74,
  },
  // module checks run only for the apps in `only` (RUNS): the count is 0 elsewhere
  parking: {
    maid: 0,
    bicycle: 0,
    parking: 29,
    indoor: 0,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  lanes: {
    maid: 0,
    bicycle: 0,
    parking: 0,
    indoor: 0,
    lanes: 27,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  'way-table': {
    maid: 0,
    bicycle: 25,
    parking: 0,
    indoor: 0,
    lanes: 25,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  reroute: {
    maid: 0,
    bicycle: 25,
    parking: 0,
    indoor: 0,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  sidepaths: {
    maid: 0,
    bicycle: 15,
    parking: 0,
    indoor: 0,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  'bike-style': {
    maid: 0,
    bicycle: 45,
    parking: 0,
    indoor: 0,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  rectangle: {
    maid: 0,
    bicycle: 0,
    parking: 24,
    indoor: 24,
    lanes: 0,
    golf: 24,
    climbing: 0,
    buildings: 24,
    maproulette: 0,
  },
  'angle-snap': {
    maid: 0,
    bicycle: 0,
    parking: 35,
    indoor: 35,
    lanes: 0,
    golf: 35,
    climbing: 0,
    buildings: 35,
    maproulette: 0,
  },
  merge: {
    maid: 0,
    bicycle: 0,
    parking: 31,
    indoor: 31,
    lanes: 0,
    golf: 31,
    climbing: 0,
    buildings: 31,
    maproulette: 0,
  },
  cut: {
    maid: 0,
    bicycle: 0,
    parking: 25,
    indoor: 25,
    lanes: 0,
    golf: 25,
    climbing: 0,
    buildings: 25,
    maproulette: 0,
  },
  divide: {
    maid: 0,
    bicycle: 0,
    parking: 23,
    indoor: 23,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 23,
    maproulette: 0,
  },
  resize: {
    maid: 0,
    bicycle: 0,
    parking: 32,
    indoor: 32,
    lanes: 0,
    golf: 32,
    climbing: 0,
    buildings: 32,
    maproulette: 0,
  },
  extrude: {
    maid: 0,
    bicycle: 0,
    parking: 22,
    indoor: 0,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 22,
    maproulette: 0,
  },
  display: {
    maid: 12,
    bicycle: 12,
    parking: 12,
    indoor: 12,
    lanes: 12,
    golf: 12,
    climbing: 12,
    buildings: 12,
    maproulette: 12,
  },
  touch: {
    maid: 0,
    bicycle: 0,
    parking: 14,
    indoor: 14,
    lanes: 0,
    golf: 14,
    climbing: 0,
    buildings: 14,
    maproulette: 0,
  },
  levels: {
    maid: 0,
    bicycle: 0,
    parking: 0,
    indoor: 34,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  room: {
    maid: 0,
    bicycle: 0,
    parking: 0,
    indoor: 21,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  menu: {
    maid: 20,
    bicycle: 20,
    parking: 20,
    indoor: 20,
    lanes: 20,
    golf: 20,
    climbing: 20,
    buildings: 20,
    maproulette: 20,
  },
  'merge-polygon': {
    maid: 23,
    bicycle: 23,
    parking: 23,
    indoor: 23,
    lanes: 23,
    golf: 23,
    climbing: 23,
    buildings: 23,
    maproulette: 23,
  },
  favourites: {
    maid: 13,
    bicycle: 13,
    parking: 13,
    indoor: 13,
    lanes: 13,
    golf: 13,
    climbing: 13,
    buildings: 13,
    maproulette: 13,
  },
  'move-handle': {
    maid: 15,
    bicycle: 15,
    parking: 15,
    indoor: 15,
    lanes: 15,
    golf: 15,
    climbing: 15,
    buildings: 15,
    maproulette: 15,
  },
  'rotate-handle': {
    maid: 22,
    bicycle: 22,
    parking: 22,
    indoor: 22,
    lanes: 22,
    golf: 22,
    climbing: 22,
    buildings: 22,
    maproulette: 22,
  },
  tooltips: {
    maid: 10,
    bicycle: 10,
    parking: 10,
    indoor: 10,
    lanes: 10,
    golf: 10,
    climbing: 10,
    buildings: 10,
    maproulette: 10,
  },
  maproulette: {
    maid: 0,
    bicycle: 0,
    parking: 0,
    indoor: 0,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 14,
  },
  'tasking-manager': {
    maid: 0,
    bicycle: 0,
    parking: 0,
    indoor: 0,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 11,
    maproulette: 0,
  },
  osmchange: {
    maid: 0,
    bicycle: 31,
    parking: 0,
    indoor: 0,
    lanes: 0,
    golf: 0,
    climbing: 0,
    buildings: 0,
    maproulette: 0,
  },
  tasks: {
    maid: 28,
    bicycle: 28,
    parking: 28,
    indoor: 28,
    lanes: 28,
    golf: 28,
    climbing: 28,
    buildings: 28,
    maproulette: 28,
  },
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
  if (only && !only.includes(app)) continue
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
