import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syntheticTasks } from './fixture.ts'
import { taskFile, pointTask } from './test-helpers.ts'

const script = join(import.meta.dir, '..', 'scripts', 'check.ts')
let dir = ''
let report = ''

/** Runs the check script on a file, with the report in the temp folder */
function run(args: string[]) {
  return Bun.spawnSync([process.execPath, script, ...args], {
    env: { ...process.env, TASKS_CHECK_REPORT: report },
    stdout: 'pipe',
    stderr: 'pipe',
  })
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tasks-check-'))
  report = join(dir, 'report.json')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the tasks-check script', () => {
  test('exit 0 and ok in the report for a valid file', () => {
    const file = join(dir, 'valid.geojson')
    writeFileSync(file, JSON.stringify(taskFile([pointTask('t-1'), pointTask('t-2')])))
    const result = run([file])
    expect(result.exitCode).toBe(0)
    const written = JSON.parse(readFileSync(report, 'utf8')) as Record<string, unknown>
    expect(written).toMatchObject({ file, ok: true, tasks: 2, options: 0, errors: [], omitted: 0 })
  })

  test('exit 1 and the errors in the report for an invalid file', () => {
    const file = join(dir, 'invalid.geojson')
    writeFileSync(file, JSON.stringify(taskFile([pointTask('t-1'), pointTask('t-1')])))
    const result = run([file])
    expect(result.exitCode).toBe(1)
    expect(result.stdout.toString()).toContain('features[1].properties.task_id')
    const written = JSON.parse(readFileSync(report, 'utf8')) as {
      ok: boolean
      tasks: number | null
      errors: { path: string }[]
    }
    expect(written.ok).toBe(false)
    expect(written.tasks).toBeNull()
    expect(written.errors[0]?.path).toBe('features[1].properties.task_id')
  })

  test('exit 1 for a file that is not JSON', () => {
    const file = join(dir, 'broken.geojson')
    writeFileSync(file, '{')
    expect(run([file]).exitCode).toBe(1)
  })

  test('exit 1 for a file that does not exist, with a report', () => {
    const result = run([join(dir, 'missing.geojson')])
    expect(result.exitCode).toBe(1)
    const written = JSON.parse(readFileSync(report, 'utf8')) as {
      ok: boolean
      errors: { message: string }[]
    }
    expect(written.ok).toBe(false)
    expect(written.errors[0]?.message).toContain('Cannot read the file')
  })

  test('exit 1 with no file argument', () => {
    expect(run([]).exitCode).toBe(1)
  })

  test('the committed fixture passes', () => {
    const file = join(import.meta.dir, '..', '..', '..', 'fixtures', 'tasks', 'small.tasks.geojson')
    expect(run([file]).exitCode).toBe(0)
  })

  test('a file of 2000 tasks passes', () => {
    const file = join(dir, 'big.geojson')
    writeFileSync(file, JSON.stringify(syntheticTasks(2000, 9)))
    expect(run([file]).exitCode).toBe(0)
  })
})
