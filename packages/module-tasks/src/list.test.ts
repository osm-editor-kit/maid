import { describe, expect, it } from 'bun:test'
import {
  boundsOf,
  buildRefIndex,
  colourExpression,
  entityIdOfRef,
  entityIdsOfTask,
  mapData,
  refOfEntityId,
  STATUS_COLOUR,
  tasksOfEntity,
} from './list.ts'
import { makeFile } from './test-support.ts'

describe('ref to task index', () => {
  const file = makeFile([
    { id: 'a', osm: ['way/1', 'node/5'] },
    { id: 'b' },
    { id: 'c', osm: ['way/1'] },
  ])
  const refs = buildRefIndex(file)

  it('maps type/id to the tasks that name it, in file order', () => {
    expect(refs.get('way/1')).toEqual([0, 2])
    expect(refs.get('node/5')).toEqual([0])
    expect(refs.get('way/2')).toBeUndefined()
  })

  it('finds the tasks of an editor id', () => {
    expect(tasksOfEntity(refs, 'w1')).toEqual([0, 2])
    expect(tasksOfEntity(refs, 'n5')).toEqual([0])
    expect(tasksOfEntity(refs, 'r1')).toEqual([])
  })

  it('knows no task for a new feature or a note', () => {
    expect(tasksOfEntity(refs, 'w-1')).toEqual([])
    expect(tasksOfEntity(refs, 'note/5')).toEqual([])
    expect(refOfEntityId('w-1')).toBeUndefined()
  })

  it('converts both ways', () => {
    expect(refOfEntityId('r12')).toBe('relation/12')
    expect(entityIdOfRef('relation/12')).toBe('r12')
    expect(entityIdsOfTask(file.features[0]!)).toEqual(['w1', 'n5'])
  })
})

describe('geometry', () => {
  it('boxes points, lines and polygons', () => {
    const file = makeFile([{ id: 'a' }, { id: 'b' }])
    expect(boundsOf(file.features[1]!.geometry)).toEqual([13.01, 52, 13.01, 52])
    expect(
      boundsOf({
        type: 'LineString',
        coordinates: [
          [1, 2],
          [3, -4],
        ],
      }),
    ).toEqual([1, -4, 3, 2])
    expect(
      boundsOf({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 3],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([0, 0, 2, 3])
    expect(
      boundsOf({
        type: 'MultiLineString',
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [5, 5],
            [6, 7],
          ],
        ],
      }),
    ).toEqual([0, 0, 6, 7])
  })

  it('gives each map feature the task index', () => {
    const data = mapData(makeFile([{ id: 'a' }, { id: 'b' }]))
    expect(data.features.map((feature) => feature.properties)).toEqual([{ i: 0 }, { i: 1 }])
  })
})

describe('colourExpression', () => {
  it('is the open colour alone while all are open', () => {
    expect(colourExpression(['open', 'open'])).toBe(STATUS_COLOUR.open)
  })
  it('matches the indexes of the other statuses and leaves empty groups out', () => {
    expect(colourExpression(['done', 'open', 'done', 'skipped'])).toEqual([
      'match',
      ['get', 'i'],
      [0, 2],
      STATUS_COLOUR.done,
      [3],
      STATUS_COLOUR.skipped,
      STATUS_COLOUR.open,
    ])
  })
})
