import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import { createValidator, neighbourhoodOf, type Rule } from '@osm-editor-kit/maid-validation'
import { createSelectionChecker, type Scheduler, whenIdle } from './validation-idle.ts'

/** The scheduler of a test: the task runs when the test says so, and a cancelled one never runs */
function queuedScheduler() {
  const queue: { task: () => void; cancelled: boolean }[] = []
  const scheduler: Scheduler = (task) => {
    const job = { task, cancelled: false }
    queue.push(job)
    return () => {
      job.cancelled = true
    }
  }
  const run = () => {
    for (const job of queue.splice(0)) if (!job.cancelled) job.task()
  }
  return { scheduler, run, pending: () => queue.filter((job) => !job.cancelled).length }
}

describe('the selection checker', () => {
  it('checks the selected feature once, and not again while it stays selected', () => {
    const checked: string[] = []
    const checker = createSelectionChecker({
      check: (id) => checked.push(id),
      // a test runs the check at once
      schedule: (task) => {
        task()
        return () => {}
      },
    })
    checker.select('w1')
    checker.select('w1')
    checker.select('n2')
    checker.select('n2')
    checker.select('w1')
    expect(checked).toEqual(['w1', 'n2', 'w1'])
  })

  it('a new selection cancels the check of the old one, which never runs', () => {
    const queue = queuedScheduler()
    const checked: string[] = []
    const checker = createSelectionChecker({
      check: (id) => checked.push(id),
      schedule: queue.scheduler,
    })
    checker.select('w1')
    checker.select('w2')
    expect(queue.pending()).toBe(1)
    queue.run()
    expect(checked).toEqual(['w2'])
  })

  it('after forget, the feature that is selected is checked again', () => {
    const queue = queuedScheduler()
    const checked: string[] = []
    const checker = createSelectionChecker({
      check: (id) => checked.push(id),
      schedule: queue.scheduler,
    })
    checker.select('w1')
    queue.run()
    checker.select('w1')
    expect(queue.pending()).toBe(0)
    checker.forget()
    checker.select('w1')
    queue.run()
    expect(checked).toEqual(['w1', 'w1'])
  })

  it('whenIdle runs its task later, and a cancelled task does not run', async () => {
    const ran: string[] = []
    whenIdle(() => ran.push('kept'))
    const cancel = whenIdle(() => ran.push('cancelled'))
    cancel()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(ran).toEqual(['kept'])
  })
})

describe('the on-demand check of a selected feature', () => {
  const context = new ModelContext()
  // A node tagged flag=yes is a finding: the check of its neighbourhood must find the flagged features there and no others.
  const flagged: Rule = {
    id: 'flagged',
    label: 'Flagged',
    validate(entity) {
      if (entity.tags.flag !== 'yes') return []
      return [
        {
          id: `flagged:${entity.id}`,
          rule: 'flagged',
          severity: 'warning',
          message: entity.id,
          entityIds: [entity.id],
          fixes: [],
        },
      ]
    },
  }
  const graph = new Graph(context, [
    new OsmNode(context, { id: 'n1', loc: [0, 0], tags: { flag: 'yes' } }),
    new OsmNode(context, { id: 'n2', loc: [0.001, 0], tags: {} }),
    new OsmNode(context, { id: 'n9', loc: [0.5, 0], tags: { flag: 'yes' } }),
    new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'], tags: {} }),
    new OsmRelation(context, {
      id: 'r1',
      members: [{ id: 'w1', type: 'way', role: '' }],
      tags: { type: 'route' },
    }),
  ])
  const ways = [graph.hasEntity('w1') as OsmWay]

  it('checks the feature, its ways and relations, and leaves the far features out', () => {
    const validator = createValidator([flagged], { showExisting: () => true })
    const checker = createSelectionChecker({
      check: (id) => {
        const { ids } = neighbourhoodOf(graph, id)
        validator.checkExisting(graph, ids, ways)
      },
      schedule: (task) => {
        task()
        return () => {}
      },
    })
    checker.select('n1')
    // n1 is flagged and in the neighbourhood; n9 is flagged but far away, not checked
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:n1'])
    checker.select('n9')
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:n9'])
  })
})
