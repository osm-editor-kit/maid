import { describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import type { ReactElement } from 'react'
import * as server from 'react-dom/server'
import { createTasksStore } from './store.ts'
import { TaskContent } from './TaskContent.tsx'
import { createTasksView } from './TasksView.tsx'
import { makeFile, openedStore, renderable } from './test-support.ts'

const render = server.renderToStaticMarkup as (node: ReactElement) => string
const editor = {} as Editor

const file = makeFile([{ id: 'with-option', osm: ['way/1'], options: true }, { id: 'plain' }])

const entity = (tags: Record<string, string>): EntityInfo =>
  ({ id: 'w1', type: 'way', tags, readOnly: false }) as unknown as EntityInfo

describe('TaskContent', () => {
  it('shows the title, the description, the diff and an Apply button for the option', () => {
    const store = openedStore(file)
    const out = render(
      <TaskContent
        store={store}
        index={0}
        editor={editor}
        entity={entity({ highway: 'service', note: 'x' })}
        hasRefs
      />,
    )
    expect(out).toContain('data-testid="tasks-content-with-option"')
    expect(out).toContain('Task with-option')
    expect(out).toContain('<strong>this</strong>')
    expect(out).toContain('data-testid="tasks-apply-fix"')
    expect(out).toContain('+ surface=asphalt')
    expect(out).toContain('− note=x')
    for (const status of ['done', 'ignored', 'skipped', 'open']) {
      expect(out).toContain(`data-testid="tasks-status-${status}"`)
    }
  })

  it('says "Already applied" instead of the button when the tags are there', () => {
    const store = openedStore(file)
    const out = render(
      <TaskContent
        store={store}
        index={0}
        editor={editor}
        entity={entity({ surface: 'asphalt' })}
        hasRefs
      />,
    )
    expect(out).toContain('data-testid="tasks-applied-fix"')
    expect(out).not.toContain('data-testid="tasks-apply-fix"')
  })

  it('shows the options without Apply when there is no feature', () => {
    const out = render(<TaskContent store={openedStore(file)} index={0} editor={editor} hasRefs />)
    expect(out).toContain('data-testid="tasks-option-fix"')
    expect(out).not.toContain('tasks-apply-fix')
  })

  it('shows Mapillary links as links', () => {
    const withImage = makeFile([{ id: 'm' }])
    withImage.features[0]!.properties.mapillary = ['123456']
    const out = render(
      <TaskContent store={openedStore(withImage)} index={0} editor={editor} hasRefs={false} />,
    )
    expect(out).toContain('href="https://www.mapillary.com/app/?pKey=123456"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).not.toContain('<img')
  })
})

describe('TasksView', () => {
  const View = (store: ReturnType<typeof createTasksStore>) => createTasksView(store, {})
  const props = {
    editor,
    select: () => {},
    selected: [] as string[],
    highlight: () => {},
    readOnly: () => false,
    display: 'normal' as const,
    setDisplay: () => {},
  }

  it('shows the empty state without a list', () => {
    const Tasks = View(renderable(createTasksStore()))
    const out = render(<Tasks {...props} />)
    expect(out).toContain('data-testid="tasks-view"')
    expect(out).toContain('No task list loaded')
  })

  it('shows the counts, the rows, the sync state and the current task without a feature', () => {
    const store = openedStore(file)
    store.getState().actions.setStatus(1, 'done')
    const Tasks = View(store)
    const out = render(<Tasks {...props} />)
    expect(out).toContain('data-testid="tasks-row-with-option"')
    expect(out).toContain('data-testid="tasks-row-plain"')
    expect(out).toMatch(/data-testid="tasks-count-open"[^>]*>1</)
    expect(out).toMatch(/data-testid="tasks-count-done"[^>]*>1</)
    expect(out).toContain('data-sync-kind="local"')
    expect(out).toContain('Only in this browser')
    // the current task (the first open one) names an OSM element that is not selected: shown here, options without Apply
    expect(out).toContain('data-testid="tasks-current"')
    expect(out).not.toContain('tasks-apply-fix')
  })

  it('leaves the current task to the inspector when its feature is selected', () => {
    const Tasks = View(openedStore(file))
    const out = render(<Tasks {...props} selected={['w1']} />)
    expect(out).not.toContain('data-testid="tasks-current"')
  })

  it('draws at most 200 rows and offers Show more', () => {
    const many = makeFile(Array.from({ length: 450 }, (_, i) => ({ id: `t${i}` })))
    const Tasks = View(openedStore(many))
    const out = render(<Tasks {...props} />)
    expect(out.match(/data-testid="tasks-row-/g)).toHaveLength(200)
    expect(out).toContain('data-testid="tasks-show-more"')
    expect(out).toContain('250 left')
  })

  it('lists the errors of a file that could not be read', () => {
    const store = renderable(createTasksStore())
    store.getState().actions.fail({
      fileName: 'bad.geojson',
      errors: [
        {
          path: 'features[0].properties.osm[0]',
          message: 'an OSM reference must look like way/123',
        },
      ],
    })
    const Tasks = View(store)
    const out = render(<Tasks {...props} />)
    expect(out).toContain('data-testid="tasks-error"')
    expect(out).toContain('bad.geojson is not a valid task file')
    expect(out).toContain('features[0].properties.osm[0]')
  })
})
