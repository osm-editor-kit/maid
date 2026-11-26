import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { useSyncExternalStore } from 'react'

/** What the module's parts hand each other at run time: the map engine, once the map is up, and the retry of the sync */
export type Shared = {
  engine?: MaidEngine
  /** Set by the controller while a sync runs; the dock's retry button calls it */
  retry?: () => void
  /** Set by the controller while a sync runs; the dock's "use this version in the account" calls it (mismatch) */
  replaceRemote?: () => void
  /** Told when `engine` changes (setSharedEngine); a component reads the engine with useSharedEngine */
  engineListeners?: Set<() => void>
}

/** Sets the map engine and tells the components that read it: the controller calls it when the map comes and goes */
export function setSharedEngine(shared: Shared, engine: MaidEngine | undefined) {
  shared.engine = engine
  for (const listener of shared.engineListeners ?? []) listener()
}

/**
 * The map engine for a component, as an external store: it renders again when the map comes up after it or the engine
 * is replaced. Handlers may still read `shared.engine` directly.
 */
export function useSharedEngine(shared: Shared): MaidEngine | undefined {
  return useSyncExternalStore(
    (listener) => {
      shared.engineListeners ??= new Set()
      shared.engineListeners.add(listener)
      return () => shared.engineListeners?.delete(listener)
    },
    () => shared.engine,
    () => shared.engine,
  )
}
