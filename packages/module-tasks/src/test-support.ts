/** Small files for the tests: a task file made in code, and a store that holds it. */
import { parseTaskFile, type TaskFile } from '@osm-editor-kit/maid-tasks'
import { createTasksStore, type TasksStore } from './store.ts'

type Spec = { id: string; osm?: string[]; options?: boolean }

/** A valid task file with one point task per spec */
export function makeFile(specs: readonly Spec[], listId = 'test-list'): TaskFile {
  const value = {
    type: 'FeatureCollection',
    maid_tasks: { version: 1, list_id: listId, title: 'Test list', description: '' },
    features: specs.map((spec, index) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13 + index / 100, 52] },
      properties: {
        task_id: spec.id,
        title: `Task ${spec.id}`,
        description: 'Check **this**.',
        ...(spec.osm ? { osm: spec.osm } : {}),
        ...(spec.options
          ? {
              options: [
                { id: 'fix', label: 'Fix it', set: { surface: 'asphalt' }, remove: ['note'] },
              ],
            }
          : {}),
      },
    })),
  }
  const result = parseTaskFile(value)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.file
}

/**
 * Makes a store render with its current state under `renderToStaticMarkup`: zustand reads `getInitialState` for the
 * server snapshot, which would be the empty state. Only tests render on the server.
 */
export function renderable(store: TasksStore): TasksStore {
  store.getInitialState = () => store.getState()
  return store
}

/** A store with the file open and nothing saved before */
export function openedStore(file: TaskFile): TasksStore {
  const store = renderable(createTasksStore())
  store.getState().actions.open({ file, fileName: 'test.geojson' })
  return store
}
