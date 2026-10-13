import { preloadLazyComponents } from '@osm-editor-kit/maid-ui'
import type { Shell } from './shell'

/** One preload per engine, started by the first call */
const preloads = new WeakMap<object, Promise<void>>()

/**
 * Loads the lazy chunks (inspector, panels, dock views, fields of modules) once the first view is complete,
 * one chunk per idle moment, so that the first click on a feature or a panel does not wait for a download.
 * Not earlier: while the first tiles are parsed and drawn, the main thread is the scarce thing.
 * The same promise on every call; it resolves when all chunks are there.
 */
export function preloadAfterFirstSettle(engine: Pick<Shell['engine'], 'settled'>): Promise<void> {
  let preload = preloads.get(engine)
  if (!preload) {
    preload = engine.settled().then(() => preloadLazyComponents())
    preloads.set(engine, preload)
  }
  return preload
}
