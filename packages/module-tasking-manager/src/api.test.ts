import { describe, expect, test } from 'bun:test'
import project from '../../../fixtures/tasking-manager/project-4242.json'
import tasks from '../../../fixtures/tasking-manager/tasks-4242.json'
import {
  loadProject,
  parseProject,
  parseTasks,
  projectTasksUrl,
  taskBounds,
  taskInstructions,
  TmError,
} from './api.ts'

describe('parseProject', () => {
  test('reads the texts, the comment and the box of the mock project', () => {
    const parsed = parseProject(project)
    expect(parsed.name).toBe('Buildings in Lichtenrade (made up)')
    expect(parsed.changesetComment).toStartWith('#hotosm-project-4242')
    expect(parsed.mappingTypes).toEqual(['BUILDINGS'])
    expect(parsed.aoiBBOX).toEqual([13.393, 52.385, 13.407, 52.393])
    expect(parsed.areaOfInterest?.type).toBe('MultiPolygon')
  })
  test('a project without texts gets its number as name', () => {
    expect(parseProject({ projectId: 7 }).name).toBe('#7')
  })
  test('anything else is a format error', () => {
    expect(() => parseProject({ Error: 'x' })).toThrow(TmError)
  })
})

describe('parseTasks', () => {
  test('reads every task of the mock with its status and grid square, sorted by id', () => {
    const parsed = parseTasks(tasks)
    expect(parsed).toHaveLength(36)
    expect(parsed[0]).toMatchObject({ taskId: 1, status: 'MAPPED', zoom: 17 })
    expect(parsed.map((task) => task.taskId)).toEqual(
      parsed.map((task) => task.taskId).sort((a, b) => a - b),
    )
  })
  test('an unknown status is read as available, a feature without an id is left out', () => {
    const square = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    }
    const parsed = parseTasks({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: square, properties: { taskId: 2, taskStatus: 'NEW' } },
        { type: 'Feature', geometry: square, properties: {} },
      ],
    })
    expect(parsed).toEqual([{ taskId: 2, status: 'READY', geometry: square as GeoJSON.Polygon }])
  })
})

test('taskInstructions fills x, y and z and keeps what the task has no value for', () => {
  expect(taskInstructions('Tile {x}/{y} at {z}, {name}', { x: 1, y: 2, zoom: 17 })).toBe(
    'Tile 1/2 at 17, {name}',
  )
  expect(taskInstructions('Tile {x}', {})).toBe('Tile {x}')
})

test('taskBounds is the box of a task', () => {
  const geometry: GeoJSON.MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [1, 2],
          [3, 2],
          [3, 5],
          [1, 5],
          [1, 2],
        ],
      ],
    ],
  }
  expect(taskBounds({ geometry })).toEqual([1, 2, 3, 5])
})

test('the link to the TM names the project', () => {
  expect(projectTasksUrl('https://tasks.hotosm.org', 4242)).toBe(
    'https://tasks.hotosm.org/projects/4242/tasks',
  )
})

describe('loadProject', () => {
  const answer = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

  test('asks for the project and its tasks in the language of the visit', async () => {
    const asked: { url: string; language?: string }[] = []
    const result = await loadProject(
      (url, init) => {
        asked.push({ url, language: init?.headers?.['Accept-Language'] })
        return answer(url.endsWith('/tasks/') ? tasks : project)
      },
      'http://tm/api/v2/',
      4242,
      'de',
    )
    expect(asked.map((a) => a.url).sort()).toEqual([
      'http://tm/api/v2/projects/4242/',
      'http://tm/api/v2/projects/4242/tasks/',
    ])
    expect(asked.every((a) => a.language === 'de')).toBe(true)
    expect(result.tasks).toHaveLength(36)
  })

  test('a 403 is a private project, a 404 a missing one, a thrown status the same', async () => {
    const kind = (fetch: Parameters<typeof loadProject>[0]) =>
      loadProject(fetch, 'http://tm', 1, 'en').catch((error: TmError) => error.kind)
    expect(await kind(() => answer({}, 403))).toBe('private')
    expect(await kind(() => answer({}, 404))).toBe('not-found')
    expect(await kind(() => Promise.reject(Object.assign(new Error('x'), { status: 404 })))).toBe(
      'not-found',
    )
    expect(await kind(() => Promise.reject(new TypeError('offline')))).toBe('network')
  })
})
