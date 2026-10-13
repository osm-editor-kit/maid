import { describe, expect, test } from 'bun:test'
import { EditHistory, ModelContext, OsmNode, type OsmTags } from '@osm-editor-kit/maid-model'
import { planSetTagsEach } from './set-tags-each'

// Nodes with tags, merged into a history as the engine's data is. No map, no engine.
function historyWith(tagsOf: Record<string, OsmTags>) {
  const context = new ModelContext()
  const history = new EditHistory(context)
  history.merge(
    Object.entries(tagsOf).map(
      ([id, tags], i) => new OsmNode(context, { id, loc: [13 + i * 0.001, 52], tags }),
    ),
  )
  return history
}

const none = () => false

/** The engine's sequence for one change: plan, perform the actions, commit, as `setTagsEach` does */
function applyEach(
  history: EditHistory,
  changes: Parameters<typeof planSetTagsEach>[1],
  isReadOnly: (id: string) => boolean = none,
) {
  const plan = planSetTagsEach(history.staging.graph, changes, isReadOnly)
  if (plan.ok && plan.changed > 0) {
    history.perform(...plan.actions)
    history.commit({
      annotation: 'Changed the feature type',
      selectedIDs: changes.map((c) => c.id),
    })
  }
  return plan
}

const tagsOf = (history: EditHistory, id: string) => history.stable.graph.entity(id).tags

describe('planSetTagsEach', () => {
  test('each feature gets its own tags: one change, one undo step', () => {
    const history = historyWith({
      n1: { amenity: 'cafe', name: 'A' },
      n2: { amenity: 'picnic_table' },
    })
    const before = history.stable.graph
    const plan = applyEach(history, [
      { id: 'n1', tags: { amenity: 'bench', name: 'A' } },
      { id: 'n2', tags: { leisure: 'picnic_table', material: 'wood' } },
    ])

    expect(plan).toMatchObject({ ok: true, changed: 2 })
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'bench', name: 'A' })
    expect(tagsOf(history, 'n2')).toEqual({ leisure: 'picnic_table', material: 'wood' })
    history.undo()
    expect(history.stable.graph).toBe(before)
  })

  test('a key that is not in the new tags is removed', () => {
    const history = historyWith({ n1: { amenity: 'cafe', cuisine: 'coffee_shop' } })
    applyEach(history, [{ id: 'n1', tags: { amenity: 'bench' } }])
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'bench' })
  })

  test('a feature whose tags already are the new tags is not touched', () => {
    const history = historyWith({
      n1: { amenity: 'bench' },
      n2: { amenity: 'cafe' },
    })
    const plan = applyEach(history, [
      { id: 'n1', tags: { amenity: 'bench' } },
      { id: 'n2', tags: { amenity: 'bench' } },
    ])
    expect(plan).toMatchObject({ ok: true, changed: 1 })
  })

  test('nothing changes: no actions and no undo step', () => {
    const history = historyWith({ n1: { amenity: 'bench' } })
    const before = history.stable.graph
    const plan = applyEach(history, [{ id: 'n1', tags: { amenity: 'bench' } }])
    expect(plan).toMatchObject({ ok: true, changed: 0 })
    expect(history.stable.graph).toBe(before)
    expect(history.getUndoAnnotation()).toBeUndefined()
  })

  test('an empty value is dropped: a blank never stays on a feature', () => {
    const history = historyWith({ n1: { amenity: 'cafe' } })
    applyEach(history, [{ id: 'n1', tags: { amenity: 'bench', note: '' } }])
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'bench' })
  })

  test('a read-only feature among them refuses the whole change, and nothing is written', () => {
    const history = historyWith({
      n1: { amenity: 'cafe' },
      n2: { amenity: 'cafe' },
    })
    const plan = applyEach(
      history,
      [
        { id: 'n1', tags: { amenity: 'bench' } },
        { id: 'n2', tags: { amenity: 'bench' } },
      ],
      (id) => id === 'n2',
    )
    expect(plan).toEqual({ ok: false, reason: 'read-only', readOnly: 1, of: 2 })
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'cafe' })
    expect(tagsOf(history, 'n2')).toEqual({ amenity: 'cafe' })
  })

  test('an id that is not in the graph refuses, and nothing is written', () => {
    const history = historyWith({ n1: { amenity: 'cafe' } })
    const plan = applyEach(history, [
      { id: 'n1', tags: { amenity: 'bench' } },
      { id: 'missing', tags: { amenity: 'bench' } },
    ])
    expect(plan).toEqual({ ok: false, reason: 'missing' })
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'cafe' })
  })

  test('a feature listed twice takes the later tags', () => {
    const history = historyWith({ n1: { amenity: 'cafe' } })
    const plan = applyEach(history, [
      { id: 'n1', tags: { amenity: 'bench' } },
      { id: 'n1', tags: { amenity: 'picnic_table' } },
    ])
    expect(plan).toMatchObject({ ok: true, changed: 1 })
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'picnic_table' })
  })
})
