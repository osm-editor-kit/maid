import { preloadLazyComponents } from '@osm-editor-kit/maid-ui'
import type { Shell } from './shell'

/**
 * Resolves once the journal is not `checking` (it is looking for stored edits, or restoring them after the person said
 * yes). `pending` also ends the wait: that is the dialog, which only a person (or a check clicking it) answers.
 */
export function journalSettled(journal: Pick<Shell['journal'], 'getState' | 'subscribe'>) {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (journal.getState().status === 'checking') return
      unsubscribe()
      resolve()
    }
    const unsubscribe = journal.subscribe(check)
    check()
  })
}

/** One preload per engine, started by the first call */
const preloads = new WeakMap<object, Promise<void>>()

/**
 * Loads the lazy chunks (inspector, panels, dock views, fields of modules) once the first view is complete,
 * one chunk per idle moment, so that the first click on a feature or a panel does not wait for a download.
 * Not earlier: while the first tiles are parsed and drawn, the main thread is the scarce thing.
 * Not on a touch device or with data saving on: a phone on mobile data does not download them (`shouldPreload`).
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

/**
 * Starts making the editor's presets (the tagging schema's data and the country data, a chunk of their own) after the
 * first picture: when the journal has looked for stored edits (what `ready` waits for), in a task of its own. Not in an
 * idle callback: the map draws and the tiles are parsed from then on, so the main thread is never idle for long, and
 * the presets would wait for the data instead of arriving while the first tiles are still on the network.
 * The chunk is fetched earlier, by a `prefetch` link in the page (see `presetsPreload`, apps/vite-presets-preload.ts),
 * but not parsed or run before the map exists. The engine fills in the icons of what was drawn without them; `settled` waits.
 */
export function loadPresetsAfterReady(shell: Pick<Shell, 'editor' | 'journal'>) {
  void journalSettled(shell.journal).then(() =>
    setTimeout(() => void shell.editor.loadPresets(), 0),
  )
}
