/**
 * What Maid MapRoulette knows now: the open challenge, the challenges it has read, the tasks of the map view, the
 * current task with its details, the tasks earmarked for the next upload, and the login. One store per module (made in
 * its setup). Requests are made by the controller (controller.ts); the store only holds their answers.
 */
import {
  type EarmarkQueue,
  emptyEarmarks,
  type MapRouletteChallenge,
  type MapRouletteTask,
  type MapRouletteTaskInBox,
  type UpdateTiming,
} from '@osm-editor-kit/maid-maproulette'
import { createStore, useStore } from 'zustand'

/** A request's state: loading, its answer, or the reason it failed */
export type Loaded<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'failed'; reason: string }

/** The map view the tasks were asked for */
export type MapView = {
  bbox: readonly [number, number, number, number]
  /** OSM zoom */
  zoom: number
  center: readonly [number, number]
}

/** What happened to the tasks after the last upload */
export type ResolveState =
  | { state: 'running'; done: number; total: number }
  | { state: 'done'; ok: number; failed: number; changesetUrl: string }

export type MapRouletteState = {
  /** The open challenge (the `maproulette` URL parameter); null: all challenges of the view */
  challengeId: string | null
  /** The challenges read so far, by id */
  challenges: Readonly<Record<string, Loaded<MapRouletteChallenge>>>
  /** The tasks of the view and the ones read before, by id (a task's newest answer wins) */
  tasks: Readonly<Record<string, MapRouletteTaskInBox>>
  /** The tasks that name an OSM feature (`w123`), from their titles and geometries */
  byEntity: Readonly<Record<string, readonly string[]>>
  /** The view of the last request; null while the map is below the zoom the tasks load at */
  view: MapView | null
  /** Whether the map is zoomed out too far to ask for tasks */
  zoomedOut: boolean
  /** The tasks of the view are being read */
  loading: boolean
  /** Why the tasks of the view could not be read */
  error: string | undefined
  /** The task the person works on */
  currentTaskId: string | null
  /** The details of tasks (instructions, tag fix), by id */
  details: Readonly<Record<string, Loaded<MapRouletteTask>>>
  /** The tasks that go to MapRoulette with the next upload */
  earmarks: EarmarkQueue
  /** The login to MapRoulette: a token the person entered (empty: none) */
  token: string
  /** When a status other than a tag fix goes to MapRoulette */
  timing: UpdateTiming
  /** Tasks whose status is being sent now, with the reason when it failed */
  sending: Readonly<Record<string, 'sending' | { failed: string; unauthorized: boolean }>>
  /** Tasks finished right away in this visit, with their status (the pin shows it until the next answer) */
  finished: Readonly<Record<string, number>>
  /** The report of the tasks after the last upload */
  resolve: ResolveState | null
}

const INITIAL: MapRouletteState = {
  challengeId: null,
  challenges: {},
  tasks: {},
  byEntity: {},
  view: null,
  zoomedOut: true,
  loading: false,
  error: undefined,
  currentTaskId: null,
  details: {},
  earmarks: emptyEarmarks,
  token: '',
  timing: 'with_save',
  sending: {},
  finished: {},
  resolve: null,
}

export function createMapRouletteStore(initial: Partial<MapRouletteState> = {}) {
  return createStore<MapRouletteState>()(() => ({ ...INITIAL, ...initial }))
}

export type MapRouletteStore = ReturnType<typeof createMapRouletteStore>

/** A part of the state, inside a component */
export function useMapRoulette<T>(
  store: MapRouletteStore,
  pick: (state: MapRouletteState) => T,
): T {
  return useStore(store, pick)
}

/** The tasks the map and the lists show: of the open challenge, or of all challenges */
export function tasksShown(state: Pick<MapRouletteState, 'tasks' | 'challengeId'>) {
  const all = Object.values(state.tasks)
  return state.challengeId === null
    ? all
    : all.filter((task) => String(task.parentId) === state.challengeId)
}

/** The status a task shows now: the one finished in this visit, an earmark's, or MapRoulette's */
export function shownStatus(
  state: Pick<MapRouletteState, 'finished' | 'earmarks'>,
  task: { id: string | number; status?: number | null },
): { status: number; queued: boolean } {
  const id = String(task.id)
  const finished = state.finished[id]
  if (finished !== undefined) return { status: finished, queued: false }
  const earmark = state.earmarks.find((e) => e.taskId === id)
  if (earmark?.localDone) return { status: earmark.status, queued: true }
  return { status: task.status ?? 0, queued: false }
}

/** The name of a challenge when it has been read */
export function challengeName(state: Pick<MapRouletteState, 'challenges'>, id: string) {
  const loaded = state.challenges[id]
  return loaded?.state === 'ready' ? loaded.value.name : undefined
}
