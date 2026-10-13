/**
 * How the shell's parts reach the editor, the engine and the config: through one React context,
 * filled by `mountEditor`. This file imports nothing from `shell.ts` but its types, so a built-in
 * module (relations) can use it without a cycle through the app's config.
 */
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Shell } from './shell'

export const ShellContext = createContext<Shell | null>(null)

/** The editor, engine, config, login and journal of this page. Throws outside `mountEditor`. */
export function useShell() {
  const shell = useContext(ShellContext)
  if (!shell) throw new Error('useShell was called outside the editor shell (see mountEditor).')
  return shell
}

/**
 * Reads from the engine inside a component. `read` runs again whenever data was merged or
 * changed. The engine lives outside React, so the React Compiler cannot see that its answers
 * change; passing the version as an argument is what tells it.
 */
export function useEngine<T>(read: (engine: MaidEngine, version: number) => T) {
  const { engine } = useShell()
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion)
  return read(engine, version)
}

/**
 * Reads from the measure of the engine (its first click and the pointer) inside a component. It is
 * read again on each move of the measure only, not on every change of the editor (see useEngine).
 */
export function useMeasure<T>(read: (engine: MaidEngine, version: number) => T) {
  const { engine } = useShell()
  const version = useSyncExternalStore(engine.subscribeMeasure, engine.getMeasureVersion)
  return read(engine, version)
}
