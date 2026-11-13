import { describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import type { ReactElement } from 'react'
import * as server from 'react-dom/server'
import { createController } from './controller.ts'
import { changesetContribution, createSaveBlock } from './SaveBlock.tsx'
import type { Shared } from './shared.ts'
import { createMapRouletteStore } from './store.ts'

const renderToStaticMarkup = server.renderToStaticMarkup as (node: ReactElement) => string

function setUp(checkinComment: string) {
  const store = createMapRouletteStore({
    challenges: {
      '7': {
        state: 'ready',
        value: { id: '7', name: 'Footways', checkinComment, checkinSource: 'survey' },
      },
    },
  })
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  const controller = createController({
    store,
    apiUrl: 'https://mr.test/api/v2',
    storage,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  })
  const shared: Shared = { editor: {} as Editor, store, controller, siteUrl: 'https://mr.test' }
  return { store, controller, shared }
}

describe('the save form', () => {
  it('says nothing while no task waits', () => {
    const { shared } = setUp('Footways')
    const contribution = changesetContribution(shared)
    expect(contribution.comment()).toBeUndefined()
    expect(contribution.tags()).toEqual({})
    const Block = createSaveBlock(shared)
    expect(renderToStaticMarkup(<Block />)).toBe('')
  })

  it("starts the comment with the challenge's, with #maproulette, and tags the task ids", async () => {
    const { controller, shared } = setUp('Add the surface of footways')
    await controller.finish('11', 1)
    await controller.finish('12', 2)
    shared.store.setState((state) => ({
      earmarks: state.earmarks.map((e) => ({ ...e, challengeId: '7' })),
    }))
    const contribution = changesetContribution(shared)
    expect(contribution.comment()).toBe('Add the surface of footways #maproulette')
    expect(contribution.source()).toBe('survey')
    expect(contribution.tags()).toEqual({
      'closed:maproulette': '11',
      'closed:maproulette:false_positive': '12',
    })
  })

  it('lists the waiting tasks with a box each', async () => {
    const { controller, shared } = setUp('Footways #maproulette')
    await controller.finish('11', 1)
    controller.include('11', false)
    // rendered on the server, zustand reads the store's first state: a store that starts with the earmark
    const Block = createSaveBlock({
      ...shared,
      store: createMapRouletteStore(shared.store.getState()),
    })
    const html = renderToStaticMarkup(<Block />)
    expect(html).toContain('MapRoulette tasks of this upload')
    expect(html).toContain('type="checkbox"')
    expect(html).not.toContain('checked')
    expect(contributionTasks(shared)).toEqual(0)
  })
})

/** How many tasks the next upload reports */
function contributionTasks(shared: Shared) {
  return Object.keys(changesetContribution(shared).tags()).length
}
