import { device, type DeviceInput } from '@osm-editor-kit/maid-i18n'
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

/**
 * Parts of the interface that are not needed for the first picture, loaded as their own chunk (`import()`):
 * the inspector, the panels of modules, the dock views, the fields of modules.
 *
 * - `lazyComponent(load)` is a component that renders `fallback` until its chunk is there. It carries its
 *   own `Suspense` boundary, so a caller needs none. Give the fallback the size of the real thing so that
 *   the layout does not move.
 * - `preloadLazyComponents()` loads every chunk made this way, one per idle moment, so that the first
 *   click does not wait for a download. The shell calls it once the first view is drawn. Not on a touch device
 *   or with data saving on (`shouldPreload`).
 * - `lazyChunksPending()` resolves when every chunk that was asked for (by a render or by the preload)
 *   has arrived. `window.__bench.settled()` waits for it, so a check never sees a half-loaded sidebar.
 *
 * Module-level collections only grow; nothing here is reassigned (React Compiler rule).
 */
/** What a flyout shows while its panel's chunk is on its way: an empty block of about the panel's height */
export const PANEL_FALLBACK = <div aria-busy="true" className="h-40" />

const loaders = new Set<() => Promise<unknown>>()
const pending = new Set<Promise<unknown>>()

function track<T>(promise: Promise<T>): Promise<T> {
  pending.add(promise)
  const done = () => void pending.delete(promise)
  promise.then(done, done)
  return promise
}

export function lazyComponent<C extends ComponentType<never>>(
  load: () => Promise<{ default: C }>,
  fallback: ReactNode = null,
): C {
  const cell: { promise?: Promise<{ default: C }> } = {}
  // one request per component, whoever asks first (a render or the preload)
  const once = () => (cell.promise ??= track(load()))
  loaders.add(once)
  const Lazy = lazy(
    once as unknown as () => Promise<{ default: ComponentType<Record<string, unknown>> }>,
  )
  function LazyComponent(props: Record<string, unknown>) {
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  return LazyComponent as unknown as C
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: 1000 })
    else setTimeout(resolve, 50)
  })
}

/**
 * Whether the idle preload runs. Not on a touch device, nor when the person asks to save data: on a phone on mobile
 * data the preload is ~167 KB (gzip) of panels most visits never open. The Inspector's chunk is not told apart from
 * them (its `lazyComponent` has no name), so all are skipped; each loads when first opened.
 */
export function shouldPreload({
  input,
  saveData,
}: {
  input: DeviceInput
  saveData: boolean
}): boolean {
  return input !== 'touch' && !saveData
}

/** Whether the person asked to save data (Network Information API, Chromium; elsewhere there is none: false) */
function savesData(): boolean {
  if (typeof navigator === 'undefined') return false
  const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } }
  return connection?.saveData === true
}

/** Loads all lazy chunks that are not loaded yet, one per idle moment. Resolves when all are there. */
export function preloadLazyComponents(): Promise<void> {
  if (!shouldPreload({ input: device().input, saveData: savesData() })) return Promise.resolve()
  return track(
    (async () => {
      for (const load of loaders) {
        await idle()
        try {
          await load()
        } catch {
          // a chunk that does not load is tried again when it is rendered, and reported there
        }
      }
    })(),
  )
}

/** Resolves when no lazy chunk is on its way (also those that were asked for while waiting) */
export async function lazyChunksPending(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled(pending)
}
