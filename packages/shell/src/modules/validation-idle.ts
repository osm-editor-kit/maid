/**
 * The on-demand check of the feature the person selects, off the click path: the check runs in idle time, so that
 * selecting never waits for it. `whenIdle` is the scheduler (requestIdleCallback, with a timer where there is none);
 * the checker takes its scheduler as an argument, so a test can run the check at once.
 */

/** Runs `task` in idle time. Returns a function that cancels it if it has not run yet. */
export function whenIdle(task: () => void): () => void {
  const host = globalThis as {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }
  if (typeof host.requestIdleCallback === 'function') {
    // the timeout keeps a busy page from putting the check off for ever
    const handle = host.requestIdleCallback(task, { timeout: 1000 })
    return () => host.cancelIdleCallback?.(handle)
  }
  const handle = setTimeout(task, 0)
  return () => clearTimeout(handle)
}

/** Runs a task and returns the function that cancels it (`whenIdle`, or a test's own) */
export type Scheduler = (task: () => void) => () => void

/**
 * Checks the selected feature when the selection changes. A selection that is already checked, or is being
 * checked, is not checked again (the inspector asks at each render). A new selection cancels the check that
 * was scheduled for the old one: only the feature the person is looking at is checked.
 */
export function createSelectionChecker(options: {
  /** Checks one feature: its neighbourhood, against the loaded data */
  check: (entityId: string) => void
  /** Runs the check later (default: `whenIdle`) */
  schedule?: Scheduler
}) {
  const schedule = options.schedule ?? whenIdle
  let current: string | undefined
  let cancel: (() => void) | undefined
  return {
    /** Asks for the check of this feature. Nothing happens for the feature that is already asked for. */
    select(entityId: string) {
      if (entityId === current) return
      cancel?.()
      current = entityId
      cancel = schedule(() => {
        cancel = undefined
        options.check(entityId)
      })
    },
    /** Forgets the feature that was checked, so the next `select` of it checks it again (after a merge) */
    forget() {
      cancel?.()
      cancel = undefined
      current = undefined
    },
  }
}
