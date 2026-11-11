import { describe, expect, test } from 'bun:test'
import { syntheticTasks } from './fixture.ts'
import { formatPath, MAX_REPORTED_ERRORS, parseTaskFile, parseTaskFileText } from './parse.ts'
import { tagTargetsOf } from './schema.ts'
import { errorsOf, listInfo, option, pointTask, taskFile } from './test-helpers.ts'

/** Whether an error at `path` exists, and with the message fragment when one is given */
function hasError(errors: { path: string; message: string }[], path: string, fragment?: string) {
  return errors.some(
    (e) => e.path === path && (fragment === undefined || e.message.includes(fragment)),
  )
}

const validExample = {
  type: 'FeatureCollection',
  maid_tasks: {
    version: 1,
    list_id: 'berlin-cycleways-2026-10',
    title: 'Check cycleways',
    description: 'Check **each** cycleway.',
    future_member: 'kept',
  },
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [13.4, 52.39],
          [13.41, 52.391],
        ],
      },
      properties: {
        task_id: 't-0001',
        title: 'Short line for the list',
        description: 'Markdown, **bold**, [link](https://example.org/x), lists.',
        osm: ['way/123', 'node/5'],
        links: ['https://example.org/x'],
        mapillary: ['123456789012345'],
        options: [
          {
            id: 'cycleway',
            label: 'It is a cycleway',
            description: 'Optional **Markdown**',
            set: { highway: 'cycleway' },
            remove: ['bicycle'],
          },
        ],
        future_property: { kept: true },
      },
    },
  ],
}

describe('a valid file', () => {
  test('the example of the format passes and keeps unknown members', () => {
    const result = parseTaskFile(validExample)
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    expect(result.file.features).toHaveLength(1)
    expect(result.file.maid_tasks.list_id).toBe('berlin-cycleways-2026-10')
    expect(result.file.maid_tasks).toHaveProperty('future_member', 'kept')
    expect(result.file.features[0]?.properties).toHaveProperty('future_property')
  })

  test('each geometry type passes', () => {
    const ring = [
      [13.4, 52.39],
      [13.41, 52.39],
      [13.41, 52.391],
      [13.4, 52.39],
    ]
    const geometries = [
      { type: 'Point', coordinates: [13.4, 52.39, 12] },
      {
        type: 'LineString',
        coordinates: [
          [13.4, 52.39],
          [13.41, 52.391],
        ],
      },
      { type: 'Polygon', coordinates: [ring] },
      {
        type: 'MultiLineString',
        coordinates: [
          [
            [13.4, 52.39],
            [13.41, 52.391],
          ],
        ],
      },
      { type: 'MultiPolygon', coordinates: [[ring]] },
    ]
    const features = geometries.map((geometry, i) => pointTask(`g-${i}`, {}))
    features.forEach((task, i) => {
      task.geometry = geometries[i] as typeof task.geometry
    })
    expect(parseTaskFile(taskFile(features)).ok).toBe(true)
  })

  test('an empty file (no tasks) passes', () => {
    expect(parseTaskFile(taskFile([])).ok).toBe(true)
  })

  test('a file of 2000 tasks passes', () => {
    expect(parseTaskFile(syntheticTasks(2000, 7)).ok).toBe(true)
  })
})

describe('the list (maid_tasks)', () => {
  test('version must be 1', () => {
    expect(hasError(errorsOf(taskFile([], { version: 2 })), 'maid_tasks.version')).toBe(true)
  })
  test('list_id must match the id pattern', () => {
    expect(hasError(errorsOf(taskFile([], { list_id: 'a b' })), 'maid_tasks.list_id')).toBe(true)
    expect(
      hasError(errorsOf(taskFile([], { list_id: 'x'.repeat(65) })), 'maid_tasks.list_id'),
    ).toBe(true)
    expect(parseTaskFile(taskFile([], { list_id: 'x'.repeat(64) })).ok).toBe(true)
  })
  test('title is 1 to 200 characters', () => {
    expect(hasError(errorsOf(taskFile([], { title: '' })), 'maid_tasks.title')).toBe(true)
    expect(hasError(errorsOf(taskFile([], { title: 'x'.repeat(201) })), 'maid_tasks.title')).toBe(
      true,
    )
    expect(parseTaskFile(taskFile([], { title: 'x'.repeat(200) })).ok).toBe(true)
  })
  test('description is at most 10 000 characters', () => {
    const errors = errorsOf(taskFile([], { description: 'x'.repeat(10_001) }))
    expect(hasError(errors, 'maid_tasks.description')).toBe(true)
  })
  test('a missing maid_tasks is an error at maid_tasks', () => {
    const input = { type: 'FeatureCollection', features: [] }
    expect(hasError(errorsOf(input), 'maid_tasks')).toBe(true)
  })
  test('list info without version is an error', () => {
    const { version: _version, ...rest } = listInfo()
    expect(
      hasError(
        errorsOf({ type: 'FeatureCollection', maid_tasks: rest, features: [] }),
        'maid_tasks.version',
      ),
    ).toBe(true)
  })
})

describe('the file', () => {
  test('type must be FeatureCollection', () => {
    expect(
      hasError(errorsOf({ ...taskFile(), type: 'Feature' }), 'type', 'FeatureCollection'),
    ).toBe(true)
  })
  test('the root must be an object', () => {
    expect(hasError(errorsOf([]), '$')).toBe(true)
    expect(hasError(errorsOf(null), '$')).toBe(true)
  })
  test('features is required', () => {
    expect(
      hasError(errorsOf({ type: 'FeatureCollection', maid_tasks: listInfo() }), 'features'),
    ).toBe(true)
  })
  test('at most 20 000 tasks', () => {
    const many = syntheticTasks(20_001, 3)
    expect(hasError(errorsOf(many), 'features')).toBe(true)
  })
  test('task ids are unique; the second copy is reported', () => {
    const errors = errorsOf(taskFile([pointTask('t-1'), pointTask('t-2'), pointTask('t-1')]))
    expect(hasError(errors, 'features[2].properties.task_id', 'duplicate task_id')).toBe(true)
    expect(errors.some((e) => e.path === 'features[0].properties.task_id')).toBe(false)
  })
  test('a duplicate is reported even when another task is broken', () => {
    const broken = { ...pointTask('t-3'), geometry: { type: 'Point', coordinates: [999, 1] } }
    const errors = errorsOf(taskFile([pointTask('t-1'), broken, pointTask('t-1')]))
    expect(hasError(errors, 'features[1].geometry.coordinates[0]')).toBe(true)
    expect(hasError(errors, 'features[2].properties.task_id', 'duplicate')).toBe(true)
  })
})

describe('a task', () => {
  test('task_id must match the id pattern', () => {
    expect(
      hasError(errorsOf(taskFile([pointTask('bad id')])), 'features[0].properties.task_id'),
    ).toBe(true)
    expect(
      hasError(errorsOf(taskFile([pointTask('x'.repeat(65))])), 'features[0].properties.task_id'),
    ).toBe(true)
    expect(parseTaskFile(taskFile([pointTask('a:b.c_d-1')])).ok).toBe(true)
  })
  test('title is 1 to 200 characters', () => {
    expect(
      hasError(errorsOf(taskFile([pointTask('t', { title: '' })])), 'features[0].properties.title'),
    ).toBe(true)
    const long = taskFile([pointTask('t', { title: 'x'.repeat(201) })])
    expect(hasError(errorsOf(long), 'features[0].properties.title')).toBe(true)
  })
  test('description is required and at most 10 000 characters', () => {
    const task = pointTask('t', { description: 'x'.repeat(10_001) })
    expect(hasError(errorsOf(taskFile([task])), 'features[0].properties.description')).toBe(true)
    const missing = pointTask('t')
    delete (missing.properties as Record<string, unknown>).description
    expect(hasError(errorsOf(taskFile([missing])), 'features[0].properties.description')).toBe(true)
  })
  test('the type must be Feature', () => {
    const task = { ...pointTask('t'), type: 'Place' }
    expect(hasError(errorsOf(taskFile([task])), 'features[0].type')).toBe(true)
  })
})

describe('osm references', () => {
  test('each must look like node/5, way/123 or relation/7', () => {
    const errors = errorsOf(
      taskFile([pointTask('t', { osm: ['way/123', 'way/0', 'nodes/5', 'way/01'] })]),
    )
    expect(hasError(errors, 'features[0].properties.osm[1]')).toBe(true)
    expect(hasError(errors, 'features[0].properties.osm[2]')).toBe(true)
    expect(hasError(errors, 'features[0].properties.osm[3]')).toBe(true)
    expect(errors.some((e) => e.path === 'features[0].properties.osm[0]')).toBe(false)
  })
  test('each must be unique; the repeat is reported', () => {
    const errors = errorsOf(taskFile([pointTask('t', { osm: ['way/1', 'node/5', 'way/1'] })]))
    expect(hasError(errors, 'features[0].properties.osm[2]', 'duplicate OSM reference')).toBe(true)
  })
  test('at most 50', () => {
    const refs = Array.from({ length: 51 }, (_, i) => `node/${i + 1}`)
    expect(
      hasError(errorsOf(taskFile([pointTask('t', { osm: refs })])), 'features[0].properties.osm'),
    ).toBe(true)
  })
  test('is optional', () => {
    expect(parseTaskFile(taskFile([pointTask('t', {})])).ok).toBe(true)
  })
})

describe('links', () => {
  test('only https:// URLs', () => {
    const errors = errorsOf(
      taskFile([
        pointTask('t', { links: ['https://example.org/a', 'http://example.org/b', 'not a url'] }),
      ]),
    )
    expect(hasError(errors, 'features[0].properties.links[1]', 'https://')).toBe(true)
    expect(hasError(errors, 'features[0].properties.links[2]', 'https://')).toBe(true)
    expect(errors.some((e) => e.path === 'features[0].properties.links[0]')).toBe(false)
  })
  test('at most 20', () => {
    const links = Array.from({ length: 21 }, (_, i) => `https://example.org/${i}`)
    expect(
      hasError(errorsOf(taskFile([pointTask('t', { links })])), 'features[0].properties.links'),
    ).toBe(true)
  })
})

describe('mapillary', () => {
  test('ids are digits only, up to 20 digits', () => {
    const errors = errorsOf(
      taskFile([pointTask('t', { mapillary: ['123', 'abc', '1'.repeat(21)] })]),
    )
    expect(hasError(errors, 'features[0].properties.mapillary[1]')).toBe(true)
    expect(hasError(errors, 'features[0].properties.mapillary[2]')).toBe(true)
  })
  test('at most 20 ids', () => {
    const ids = Array.from({ length: 21 }, (_, i) => String(i + 1))
    expect(
      hasError(
        errorsOf(taskFile([pointTask('t', { mapillary: ids })])),
        'features[0].properties.mapillary',
      ),
    ).toBe(true)
  })
})

describe('options', () => {
  const withOptions = (options: unknown[]) => taskFile([pointTask('t', { options })])

  test('at most 10 per task', () => {
    const options = Array.from({ length: 11 }, (_, i) => option({ id: `o-${i}` }))
    expect(hasError(errorsOf(withOptions(options)), 'features[0].properties.options')).toBe(true)
    const ten = Array.from({ length: 10 }, (_, i) => option({ id: `o-${i}` }))
    expect(parseTaskFile(withOptions(ten)).ok).toBe(true)
  })
  test('option ids are unique per task; the repeat is reported', () => {
    const errors = errorsOf(
      withOptions([option({ id: 'a' }), option({ id: 'b' }), option({ id: 'a' })]),
    )
    expect(hasError(errors, 'features[0].properties.options[2].id', 'duplicate option id')).toBe(
      true,
    )
  })
  test('the same option id in two tasks is fine', () => {
    const file = taskFile([
      pointTask('t-1', { options: [option({ id: 'a' })] }),
      pointTask('t-2', { options: [option({ id: 'a' })] }),
    ])
    expect(parseTaskFile(file).ok).toBe(true)
  })
  test('a key may not be in both set and remove', () => {
    const errors = errorsOf(
      withOptions([option({ set: { highway: 'cycleway' }, remove: ['highway'] })]),
    )
    expect(
      hasError(errors, 'features[0].properties.options[0].remove[0]', 'both set and remove'),
    ).toBe(true)
  })
  test('at least one of set and remove must be non-empty', () => {
    expect(
      hasError(
        errorsOf(withOptions([option({ set: {}, remove: [] })])),
        'features[0].properties.options[0]',
      ),
    ).toBe(true)
    const bare = { id: 'a', label: 'A' }
    expect(hasError(errorsOf(withOptions([bare])), 'features[0].properties.options[0]')).toBe(true)
  })
  test('remove alone is fine', () => {
    expect(parseTaskFile(withOptions([{ id: 'a', label: 'A', remove: ['maxspeed'] }])).ok).toBe(
      true,
    )
  })
  test('set keys and values are 1 to 255 characters; an empty value is refused', () => {
    const empty = errorsOf(withOptions([option({ set: { highway: '' } })]))
    expect(hasError(empty, 'features[0].properties.options[0].set.highway')).toBe(true)
    const longKey = errorsOf(withOptions([option({ set: { ['k'.repeat(256)]: 'v' } })]))
    expect(longKey.some((e) => e.path.startsWith('features[0].properties.options[0].set'))).toBe(
      true,
    )
    const longValue = errorsOf(withOptions([option({ set: { highway: 'v'.repeat(256) } })]))
    expect(hasError(longValue, 'features[0].properties.options[0].set.highway')).toBe(true)
  })
  test('a key with a colon is written in brackets', () => {
    const errors = errorsOf(withOptions([option({ set: { 'cycleway:both': '' } })]))
    expect(hasError(errors, 'features[0].properties.options[0].set["cycleway:both"]')).toBe(true)
  })
  test('remove keys are 1 to 255 characters', () => {
    expect(
      hasError(
        errorsOf(withOptions([{ id: 'a', label: 'A', remove: [''] }])),
        'features[0].properties.options[0].remove[0]',
      ),
    ).toBe(true)
  })
  test('id, label and description are checked', () => {
    expect(
      hasError(
        errorsOf(withOptions([option({ id: 'bad id' })])),
        'features[0].properties.options[0].id',
      ),
    ).toBe(true)
    expect(
      hasError(
        errorsOf(withOptions([option({ label: '' })])),
        'features[0].properties.options[0].label',
      ),
    ).toBe(true)
    const long = option({ description: 'x'.repeat(10_001) })
    expect(
      hasError(errorsOf(withOptions([long])), 'features[0].properties.options[0].description'),
    ).toBe(true)
  })
})

describe('geometry', () => {
  const withGeometry = (geometry: unknown) => taskFile([{ ...pointTask('t'), geometry }])

  test('geometry is required', () => {
    const task = pointTask('t')
    delete (task as Record<string, unknown>).geometry
    expect(hasError(errorsOf(taskFile([task])), 'features[0].geometry')).toBe(true)
    expect(hasError(errorsOf(withGeometry(null)), 'features[0].geometry')).toBe(true)
  })
  test('only the five GeoJSON types', () => {
    expect(
      hasError(
        errorsOf(withGeometry({ type: 'Circle', coordinates: [1, 2] })),
        'features[0].geometry.type',
      ),
    ).toBe(true)
  })
  test('longitude must be between -180 and 180', () => {
    const errors = errorsOf(withGeometry({ type: 'Point', coordinates: [181, 52] }))
    expect(hasError(errors, 'features[0].geometry.coordinates[0]', 'longitude')).toBe(true)
  })
  test('latitude must be between -90 and 90', () => {
    const errors = errorsOf(withGeometry({ type: 'Point', coordinates: [13, -91] }))
    expect(hasError(errors, 'features[0].geometry.coordinates[1]', 'latitude')).toBe(true)
  })
  test('a LineString needs at least 2 positions', () => {
    expect(
      hasError(
        errorsOf(withGeometry({ type: 'LineString', coordinates: [[13, 52]] })),
        'features[0].geometry.coordinates',
      ),
    ).toBe(true)
  })
  test('a Polygon ring needs at least 4 positions and must be closed', () => {
    const open = [
      [13, 52],
      [13.1, 52],
      [13.1, 52.1],
      [13, 52.1],
    ]
    expect(
      hasError(
        errorsOf(withGeometry({ type: 'Polygon', coordinates: [open] })),
        'features[0].geometry.coordinates[0]',
        'closed',
      ),
    ).toBe(true)
    const short = [
      [13, 52],
      [13.1, 52],
      [13, 52],
    ]
    expect(
      hasError(
        errorsOf(withGeometry({ type: 'Polygon', coordinates: [short] })),
        'features[0].geometry.coordinates[0]',
        'at least 4',
      ),
    ).toBe(true)
  })
  test('a bad position inside a MultiLineString has its full path', () => {
    const geometry = {
      type: 'MultiLineString',
      coordinates: [
        [
          [13, 52],
          [13, 52],
        ],
        [
          [13, 52],
          [200, 52],
        ],
      ],
    }
    expect(
      hasError(errorsOf(withGeometry(geometry)), 'features[0].geometry.coordinates[1][1][0]'),
    ).toBe(true)
  })
})

describe('the parse of text', () => {
  test('text that is not JSON is one error at the root', () => {
    const result = parseTaskFileText('{ not json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.path).toBe('$')
    expect(result.errors[0]?.message.startsWith('Not valid JSON')).toBe(true)
  })
  test('valid text parses to the file', () => {
    const result = parseTaskFileText(JSON.stringify(validExample))
    expect(result.ok).toBe(true)
  })
})

describe('error paths and the cap', () => {
  test('formatPath writes the path the way people read it', () => {
    expect(formatPath(['features', 3, 'properties', 'osm', 0])).toBe(
      'features[3].properties.osm[0]',
    )
    expect(formatPath([])).toBe('$')
    expect(formatPath(['options', 0, 'set', 'cycleway:both'])).toBe(
      'options[0].set["cycleway:both"]',
    )
  })

  test('at most 100 errors are kept and the rest are counted', () => {
    const broken = Array.from({ length: 150 }, (_, i) => ({
      ...pointTask(`t-${i}`),
      geometry: { type: 'Point', coordinates: [999, 1] },
    }))
    const result = parseTaskFile(taskFile(broken))
    if (result.ok) throw new Error('expected errors')
    expect(result.errors).toHaveLength(MAX_REPORTED_ERRORS)
    expect(result.omitted).toBe(50)
  })

  test('a file with few errors has no omitted count', () => {
    const result = parseTaskFile(
      taskFile([{ ...pointTask('t'), geometry: { type: 'Point', coordinates: [999, 1] } }]),
    )
    if (result.ok) throw new Error('expected errors')
    expect(result.omitted).toBeUndefined()
  })
})

describe('create and delete options', () => {
  const ok = (input: unknown) => {
    const result = parseTaskFile(input)
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    return result.file
  }
  const lineTask = (properties: Record<string, unknown>) => ({
    ...pointTask('t-1', properties),
    geometry: {
      type: 'LineString',
      coordinates: [
        [13.4, 52.39],
        [13.41, 52.391],
      ],
    },
  })

  test('a create option on a point task, and one with its own geometry, pass', () => {
    const file = ok(
      taskFile([
        pointTask('t-1', {
          options: [
            { id: 'add', label: 'Add a bench', action: 'create', set: { amenity: 'bench' } },
            {
              id: 'add-area',
              label: 'Add the playground',
              action: 'create',
              set: { leisure: 'playground' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [13.4, 52.39],
                    [13.41, 52.39],
                    [13.41, 52.391],
                    [13.4, 52.39],
                  ],
                ],
              },
            },
          ],
        }),
      ]),
    )
    expect(file.features[0]?.properties.options?.[1]?.geometry?.type).toBe('Polygon')
  })

  test('a create option needs tags and has no remove, osm or a geometry it cannot make', () => {
    const errors = errorsOf(
      taskFile([
        pointTask('t-1', {
          options: [
            { id: 'a', label: 'A', action: 'create' },
            { id: 'b', label: 'B', action: 'create', set: { a: 'b' }, remove: ['c'] },
            { id: 'c', label: 'C', action: 'create', set: { a: 'b' }, osm: ['node/1'] },
          ],
        }),
      ]),
    )
    expect(
      hasError(errors, 'features[0].properties.options[0].set', 'tags of the new feature'),
    ).toBe(true)
    expect(hasError(errors, 'features[0].properties.options[1].remove')).toBe(true)
    expect(hasError(errors, 'features[0].properties.options[2].osm')).toBe(true)
    const multi = errorsOf(
      taskFile([
        {
          ...pointTask('t-1', {
            options: [{ id: 'a', label: 'A', action: 'create', set: { a: 'b' } }],
          }),
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [13.4, 52.39],
                [13.41, 52.391],
              ],
            ],
          },
        },
      ]),
    )
    expect(
      hasError(multi, 'features[0].properties.options[0]', 'Point, a LineString or a Polygon'),
    ).toBe(true)
  })

  test('a delete option deletes the task features, or the ones it names among them', () => {
    ok(
      taskFile([
        lineTask({
          osm: ['way/1', 'node/2'],
          options: [
            { id: 'all', label: 'Delete both', action: 'delete' },
            { id: 'way', label: 'Delete the way', action: 'delete', osm: ['way/1'] },
          ],
        }),
      ]),
    )
  })

  test('a delete option needs features, only nodes and ways, only the task ones, and no tags', () => {
    const errors = errorsOf(
      taskFile([
        lineTask({
          osm: ['way/1', 'relation/3'],
          options: [
            { id: 'a', label: 'A', action: 'delete', set: { a: 'b' } },
            { id: 'b', label: 'B', action: 'delete', osm: ['way/9'] },
            { id: 'c', label: 'C', action: 'delete', osm: ['relation/3'] },
          ],
        }),
        pointTask('t-2', { options: [{ id: 'a', label: 'A', action: 'delete' }] }),
      ]),
    )
    expect(hasError(errors, 'features[0].properties.options[0].set')).toBe(true)
    expect(hasError(errors, 'features[0].properties.osm[1]', 'relations cannot be deleted')).toBe(
      true,
    )
    expect(hasError(errors, 'features[0].properties.options[1].osm[0]', 'not in the task')).toBe(
      true,
    )
    expect(hasError(errors, 'features[0].properties.options[2].osm[0]', 'not relations')).toBe(true)
    expect(hasError(errors, 'features[1].properties.options[0]', 'needs osm references')).toBe(true)
  })

  test('a tag option may name the task features it is for', () => {
    const file = ok(
      taskFile([
        lineTask({
          osm: ['way/1', 'way/2'],
          options: [
            option({ id: 'a', osm: ['way/2'] }),
            option({ id: 'b', osm: ['way/1', 'way/2'] }),
          ],
        }),
      ]),
    )
    const [first, second] = file.features[0]?.properties.options ?? []
    expect(first && tagTargetsOf(first)).toEqual(['way/2'])
    expect(second && tagTargetsOf(second)).toEqual(['way/1', 'way/2'])
    const errors = errorsOf(
      taskFile([
        lineTask({
          osm: ['way/1', 'way/2'],
          options: [option({ id: 'a', osm: ['way/9'] })],
        }),
        pointTask('t-2', {
          options: [{ id: 'c', label: 'C', action: 'create', set: { a: 'b' }, osm: ['way/1'] }],
        }),
      ]),
    )
    expect(hasError(errors, 'features[0].properties.options[0].osm[0]', 'not in the task')).toBe(
      true,
    )
    expect(hasError(errors, 'features[1].properties.options[0].osm', 'no osm')).toBe(true)
  })

  test('an unknown action and a geometry on a tag option are refused', () => {
    const errors = errorsOf(
      taskFile([
        pointTask('t-1', {
          options: [
            option({ id: 'a', action: 'move' }),
            option({ id: 'b', geometry: { type: 'Point', coordinates: [13.4, 52.39] } }),
          ],
        }),
      ]),
    )
    expect(hasError(errors, 'features[0].properties.options[0].action')).toBe(true)
    expect(hasError(errors, 'features[0].properties.options[1].geometry')).toBe(true)
  })
})
