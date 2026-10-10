/**
 * Runs inside the page of every editor. Records frames and long tasks and drives the camera
 * through the same path in each editor. Injected by the runner before any page script.
 */
import type { BenchCamera } from '../refs/bench-api'

export type Recording = {
  /** Time between consecutive animation frames in ms */
  frames: number[]
  /** Durations of main-thread tasks over 50ms */
  longTasks: number[]
  durationMs: number
}

export function installProbe() {
  let frames: number[] = []
  let longTasks: number[] = []
  let last = 0
  let startedAt = 0
  let running = false

  try {
    new PerformanceObserver((list) => {
      if (running) for (const entry of list.getEntries()) longTasks.push(entry.duration)
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    // long tasks are a Chrome feature; frame times still work everywhere
  }

  const tick = (now: number) => {
    if (!running) return
    if (last) frames.push(now - last)
    last = now
    requestAnimationFrame(tick)
  }

  const probe = {
    start() {
      frames = []
      longTasks = []
      last = 0
      running = true
      startedAt = performance.now()
      requestAnimationFrame(tick)
    },
    stop(): Recording {
      running = false
      return { frames, longTasks, durationMs: performance.now() - startedAt }
    },
    /** Moves the camera linearly from `from` to `to`, one step per animation frame */
    animate(from: BenchCamera, to: BenchCamera, ms: number) {
      return new Promise<void>((resolve) => {
        const t0 = performance.now()
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms)
          window.__bench.setCamera({
            lng: from.lng + (to.lng - from.lng) * t,
            lat: from.lat + (to.lat - from.lat) * t,
            zoom: from.zoom + (to.zoom - from.zoom) * t,
          })
          if (t < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      })
    },
    /**
     * Time from the next pointer move until what the editor shows as hovered changes,
     * checked once per frame.
     */
    hoverLatency(timeoutMs = 2000) {
      return new Promise<number>((resolve) => {
        let movedAt = 0
        const before = window.__bench.hovered().join()
        const onMove = () => {
          movedAt = performance.now()
          window.removeEventListener('pointermove', onMove, true)
          requestAnimationFrame(check)
        }
        const check = () => {
          const now = performance.now()
          const current = window.__bench.hovered()
          if (current.length > 0 && current.join() !== before) resolve(now - movedAt)
          else if (now - movedAt > timeoutMs) resolve(-1)
          else requestAnimationFrame(check)
        }
        window.addEventListener('pointermove', onMove, true)
      })
    },
  }
  Object.assign(window, { __probe: probe })
}

declare global {
  interface Window {
    __probe: {
      start(): void
      stop(): Recording
      animate(from: BenchCamera, to: BenchCamera, ms: number): Promise<void>
      hoverLatency(timeoutMs?: number): Promise<number>
    }
  }
}
