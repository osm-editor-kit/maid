import { describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import {
  actionAddEntity,
  actionMoveNode,
  EditHistory,
  ModelContext,
  OsmNode,
} from '@osm-editor-kit/maid-model'
import type { UploadResult } from 'osm-api'
import type { DataSource } from '../config.ts'
import { pendingChange, uploadEdits } from './save.ts'

type Upload = { tags: Record<string, string>; diff: ReturnType<typeof pendingChange> }
type Shelled = Parameters<typeof uploadEdits>[0]

/**
 * The editor and a fake OSM client. The base has one node (n1, version 3). The test then moves it and
 * adds a bench, which gets the id n-1 the way a session gives one. The client never leaves the test.
 */
function setUp(
  options: {
    source?: DataSource
    fail?: boolean
    selectBench?: boolean
    brand?: string
    version?: string
  } = {},
) {
  const context = new ModelContext()
  const history = new EditHistory(context)
  history.merge([new OsmNode(context, { id: 'n1', loc: [13, 52], version: 3, tags: {} })])
  history.perform(actionMoveNode('n1', [13.1, 52.05]))
  history.commit({ annotation: 'Moved a node', selectedIDs: ['n1'] })
  const bench = new OsmNode(context, { loc: [13.2, 52.2], tags: { amenity: 'bench' } })
  history.perform(actionAddEntity(bench))
  history.commit({ annotation: 'Added a point', selectedIDs: [bench.id] })

  const editor = {
    context,
    history,
    registry: () => ({ list: () => [] }),
  } as unknown as Editor
  const uploads: Upload[] = []
  const reloads: { selection: string[]; delayMs: number }[] = []
  const answer: UploadResult = {
    77: {
      diffResult: {
        node: {
          '-1': { newId: 555, newVersion: 1 },
          '1': { newId: 1, newVersion: 4 },
        },
      },
    },
  }
  const OSM = {
    uploadChangeset: async (tags: Record<string, string>, diff: Upload['diff']) => {
      uploads.push({ tags, diff })
      if (options.fail) throw new Error('The element was changed by someone else')
      return answer
    },
  }
  const engine = {
    selection: options.selectBench ? [bench.id] : [],
    reloadAfterUpload: (selection: readonly string[], delayMs: number) =>
      reloads.push({ selection: [...selection], delayMs }),
  }
  const shell = {
    config: { source: options.source ?? 'dev' },
    editor,
    engine,
    auth: { api: async () => OSM },
    brand: { name: options.brand ?? 'Maid Parking' },
    version: options.version ?? '0.1.0',
  } as unknown as Shelled
  return { editor, history, context, shell, uploads, reloads }
}

describe('uploadEdits', () => {
  it('uploads the edits, then forgets them and loads the map again once', async () => {
    const { editor, history, shell, uploads, reloads } = setUp({ selectBench: true })

    const done = await uploadEdits(shell, 'Moved and added')

    expect(done.changesets).toEqual([77])
    expect(done.selection).toEqual(['n555'])
    expect(uploads).toHaveLength(1)
    expect(uploads[0]?.tags.comment).toBe('Moved and added')
    // the changeset names the app that made it: its brand name and version
    expect(uploads[0]?.tags.created_by).toBe('Maid Parking 0.1.0')
    expect(uploads[0]?.diff.create.map((e) => e.id)).toEqual([-1])
    expect(uploads[0]?.diff.modify.map((e) => e.id)).toEqual([1])
    // nothing is left to save and nothing to undo, as after iD's flush
    expect(history.hasChanges()).toBe(false)
    expect(history.getUndoAnnotation()).toBeUndefined()
    expect(pendingChange(editor)).toEqual({ create: [], modify: [], delete: [] })
    expect(reloads).toEqual([{ selection: ['n555'], delayMs: 2500 }])
  })

  it('sends the next edit alone: the saved ones are not sent a second time', async () => {
    const { context, history, shell, uploads } = setUp()
    await uploadEdits(shell, 'First')

    const next = new OsmNode(context, { loc: [13.3, 52.3], tags: { amenity: 'bin' } })
    history.perform(actionAddEntity(next))
    history.commit({ annotation: 'Added a bin', selectedIDs: [next.id] })
    await uploadEdits(shell, 'Second')

    expect(uploads).toHaveLength(2)
    expect(uploads[1]?.diff.create.map((e) => e.id)).toEqual([-2])
    expect(uploads[1]?.diff.modify).toEqual([])
    expect(uploads[1]?.diff.delete).toEqual([])
  })

  it('sends nothing when the app has no version: created_by would be wrong', async () => {
    const { history, shell, uploads } = setUp({ version: '' })

    expect(uploadEdits(shell, 'No version')).rejects.toThrow('created_by needs an app name')

    expect(uploads).toHaveLength(0)
    expect(history.hasChanges()).toBe(true)
  })

  it('keeps the edits and does not reload the map when the upload fails', async () => {
    const { history, shell, reloads } = setUp({ fail: true })

    expect(uploadEdits(shell, 'Refused')).rejects.toThrow('changed by someone else')

    expect(history.hasChanges()).toBe(true)
    expect(reloads).toEqual([])
  })

  it('uploads nothing on the mock', async () => {
    const { history, shell, uploads, reloads } = setUp({ source: 'mock' })

    expect(uploadEdits(shell, 'Not here')).rejects.toThrow('on a server')

    expect(uploads).toEqual([])
    expect(history.hasChanges()).toBe(true)
    expect(reloads).toEqual([])
  })
})
