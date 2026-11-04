import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { applyOption, isApplied } from './diff.ts'
import { type FixtureElement, generateTasks, mulberry32, syntheticTasks } from './fixture.ts'
import { parseTaskFile, parseTaskFileText } from './parse.ts'

const repo = join(import.meta.dir, '..', '..', '..')

/** The elements of the small OSM fixture */
async function smallElements(): Promise<FixtureElement[]> {
  const gz = await Bun.file(join(repo, 'fixtures', 'small.json.gz')).arrayBuffer()
  const scene = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(gz)))) as {
    elements: FixtureElement[]
  }
  return scene.elements
}

describe('mulberry32', () => {
  test('the same seed gives the same numbers, in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const first = Array.from({ length: 100 }, () => a())
    expect(first).toEqual(Array.from({ length: 100 }, () => b()))
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true)
  })

  test('another seed gives other numbers', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
})

describe('generateTasks on the small fixture', () => {
  test('makes 40 tasks that pass the format', async () => {
    const file = generateTasks({ seed: 20261027, count: 40, elements: await smallElements() })
    expect(file.features).toHaveLength(40)
    const result = parseTaskFile(file)
    expect(result.ok).toBe(true)
  })

  test('two runs give the same output', async () => {
    const elements = await smallElements()
    const a = JSON.stringify(generateTasks({ seed: 7, count: 40, elements }))
    const b = JSON.stringify(generateTasks({ seed: 7, count: 40, elements }))
    expect(a).toBe(b)
  })

  test('another seed gives other tasks', async () => {
    const elements = await smallElements()
    const a = JSON.stringify(generateTasks({ seed: 7, count: 40, elements }))
    const b = JSON.stringify(generateTasks({ seed: 8, count: 40, elements }))
    expect(a).not.toBe(b)
  })

  test('each task has an OSM reference, a description and 1 to 3 options', async () => {
    const file = generateTasks({ seed: 20261027, count: 40, elements: await smallElements() })
    for (const task of file.features) {
      expect(task.properties.osm).toHaveLength(1)
      expect(task.properties.description.length).toBeGreaterThan(0)
      const count = task.properties.options?.length ?? 0
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(3)
    }
  })

  test('some options are already done and some are not', async () => {
    const file = generateTasks({ seed: 20261027, count: 40, elements: await smallElements() })
    const flags = file.features.flatMap((task) => {
      const tags = wayOrNodeTags(task.properties.osm?.[0])
      return (task.properties.options ?? []).map((option) => isApplied(tags, option))
    })
    const done = flags.filter(Boolean).length
    expect(done).toBeGreaterThan(0)
    expect(done).toBeLessThan(flags.length)
  })

  test('the fixture has ways (LineString) and nodes (Point)', async () => {
    const file = generateTasks({ seed: 20261027, count: 40, elements: await smallElements() })
    const types = new Set(file.features.map((task) => task.geometry.type))
    expect(types).toEqual(new Set(['LineString', 'Point']))
  })

  test('too few elements for the count is an error', () => {
    expect(() => generateTasks({ seed: 1, count: 5, elements: [] })).toThrow('too few')
  })

  test('an option of a generated task can be applied', async () => {
    const file = generateTasks({ seed: 20261027, count: 40, elements: await smallElements() })
    const task = file.features[0]
    const option = task?.properties.options?.[0]
    if (!option) throw new Error('expected an option')
    const tags = { highway: 'residential' }
    expect(applyOption(tags, option)).toBeDefined()
  })
})

describe('the committed fixture', () => {
  test('fixtures/tasks/small.tasks.geojson is what the generator writes', async () => {
    const file = generateTasks({ seed: 20261027, count: 40, elements: await smallElements() })
    const committed = await Bun.file(join(repo, 'fixtures', 'tasks', 'small.tasks.geojson')).text()
    expect(committed).toBe(`${JSON.stringify(file, null, 2)}\n`)
  })

  test('it parses', async () => {
    const text = await Bun.file(join(repo, 'fixtures', 'tasks', 'small.tasks.geojson')).text()
    const result = parseTaskFileText(text)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.file.features).toHaveLength(40)
  })
})

describe('syntheticTasks', () => {
  test('is deterministic for a seed', () => {
    expect(JSON.stringify(syntheticTasks(100, 5))).toBe(JSON.stringify(syntheticTasks(100, 5)))
  })

  test('2000 tasks parse', () => {
    expect(parseTaskFile(syntheticTasks(2000, 1)).ok).toBe(true)
  })

  test('20 000 tasks parse in under 2 s (the time is printed)', () => {
    const file = syntheticTasks(20_000, 1)
    const start = performance.now()
    const result = parseTaskFile(file)
    const elapsed = performance.now() - start
    console.log(`parseTaskFile(20 000 tasks): ${elapsed.toFixed(1)} ms`)
    expect(result.ok).toBe(true)
    expect(elapsed).toBeLessThan(2000)
  })

  test('20 000 tasks as text parse in under 2 s (the time is printed)', () => {
    const text = JSON.stringify(syntheticTasks(20_000, 1))
    const start = performance.now()
    const result = parseTaskFileText(text)
    const elapsed = performance.now() - start
    console.log(
      `parseTaskFileText(20 000 tasks, ${(text.length / 1e6).toFixed(1)} MB): ${elapsed.toFixed(1)} ms`,
    )
    expect(result.ok).toBe(true)
    expect(elapsed).toBeLessThan(2000)
  })
})

/** The tags of the way or node a task refers to, from the small fixture (used to check "already done") */
function wayOrNodeTags(ref: string | undefined): Record<string, string> {
  if (!ref) return {}
  const [type, id] = ref.split('/')
  return tagsByRef.get(`${type}/${id}`) ?? {}
}

const tagsByRef = new Map<string, Record<string, string>>()
await (async () => {
  for (const element of await smallElements()) {
    if (element.tags) tagsByRef.set(`${element.type}/${element.id}`, element.tags)
  }
})()
