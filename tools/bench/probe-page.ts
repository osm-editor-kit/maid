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
  let armed: Promise<number> | null = null

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
     * Starts listening for the next pointer move; the runner awaits this call BEFORE it moves the mouse. Without it the
     * move can reach the page before the listener exists (the evaluate that registers it and the mouse move travel on
     * separate paths), and then nothing ever follows: that was the hang of the hover phase.
     */
    armHover(timeoutMs = 2000, giveUpMs = 8000) {
      armed = new Promise<number>((resolve, reject) => {
        let movedAt = 0
        const before = window.__bench.hovered().join()
        const state = () => {
          try {
            return JSON.stringify((window as any).__maid?.debug?.() ?? null).slice(0, 3000)
          } catch {
            return 'no debug state'
          }
        }
        // no pointer move at all: bounded, with the page's state, instead of waiting for ever
        const giveUp = setTimeout(() => {
          window.removeEventListener('pointermove', onMove, true)
          reject(
            new Error(`no pointer move reached the page within ${giveUpMs} ms; page: ${state()}`),
          )
        }, giveUpMs)
        const onMove = () => {
          if (movedAt) return
          movedAt = performance.now()
          clearTimeout(giveUp)
          window.removeEventListener('pointermove', onMove, true)
          // checked from the next frame after the move, as the latency is counted from the move
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
      armed.catch(() => {}) // the caller that awaits it sees the error; this keeps a late one from being unhandled
    },
    /**
     * Milliseconds from the first pointer move after `armHover` until the hover highlight shows another feature, or -1
     * when the pointer moved and nothing new was shown within `timeoutMs`. Rejects when no pointer move arrives.
     */
    hoverLatency(this: { armHover(t?: number): void }, timeoutMs = 2000) {
      if (!armed) this.armHover(timeoutMs)
      const result = armed!
      armed = null
      return result
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
      armHover(timeoutMs?: number, giveUpMs?: number): void
      hoverLatency(timeoutMs?: number): Promise<number>
    }
  }
}
