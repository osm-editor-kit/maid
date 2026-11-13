/**
 * What the Tasking Manager module knows: the open project with its tasks, and the task the person works on. One store
 * per module (made in its setup); the requests are made by `open` in module.tsx, the store holds their answers.
 */
import { createStore, useStore } from 'zustand'
import type { TmProject, TmTask } from './api.ts'

export type TmState = {
  /** The project of the link; null: none open */
  projectId: number | null
  /** The project and its tasks, while they load, or why they could not be read */
  loaded:
    | { state: 'loading' }
    | { state: 'ready'; project: TmProject; tasks: readonly TmTask[] }
    | { state: 'failed'; reason: string }
    | null
  /** The task the person works on */
  taskId: number | null
}

export function createTmStore(initial: Partial<TmState> = {}) {
  return createStore<TmState>()(() => ({ projectId: null, loaded: null, taskId: null, ...initial }))
}

export type TmStore = ReturnType<typeof createTmStore>

export function useTm<T>(store: TmStore, pick: (state: TmState) => T): T {
  return useStore(store, pick)
}

/** The open project, when it is read */
export function openProject(state: TmState) {
  return state.loaded?.state === 'ready' ? state.loaded.project : undefined
}

/** The current task, when the project is read and has it */
export function currentTask(state: TmState) {
  if (state.loaded?.state !== 'ready' || state.taskId === null) return undefined
  return state.loaded.tasks.find((task) => task.taskId === state.taskId)
}
