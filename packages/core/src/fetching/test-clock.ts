/**
 * A clock that moves only when a test moves it. `sleep` resolves when the clock has been advanced
 * past its time. The gate and Retry-After use it, so no real time passes in the tests.
 */
export interface TestClock {
  // Function-valued, not methods, so that they can be passed on without `this`.
  now: () => number
  sleep: (ms: number) => Promise<void>
  /** Moves time forward, resolving the sleeps that fall due in order of their time. */
  advance: (ms: number) => Promise<void>
}

/** Lets pending promise callbacks run. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export function createTestClock(start = 1_000_000): TestClock {
  const state = { time: start }
  const timers: { at: number; resolve: () => void }[] = []

  function takeFirstDue(target: number): { at: number; resolve: () => void } | undefined {
    const first = timers.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at)[0]
    if (first !== undefined) timers.splice(timers.indexOf(first), 1)
    return first
  }

  return {
    now: () => state.time,
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        timers.push({ at: state.time + Math.max(0, ms), resolve })
      }),
    async advance(ms) {
      const target = state.time + ms
      let due = takeFirstDue(target)
      while (due !== undefined) {
        state.time = due.at
        due.resolve()
        await settle()
        due = takeFirstDue(target)
      }
      state.time = target
      await settle()
    },
  }
}
