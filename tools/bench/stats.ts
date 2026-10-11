export function quantile(values: number[], q: number) {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

export const median = (values: number[]) => quantile(values, 0.5)
const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits

export type FrameSummary = {
  frames: number
  fps: number
  medianMs: number
  p95Ms: number
  maxMs: number
  /** Share of time spent in frames longer than 2 refresh intervals (visible stutter) */
  slowShare: number
  /** Frames longer than 100ms: the picture visibly hangs */
  hangs: number
  longTasks: number
  longTaskMs: number
}

/** @param refreshMs the display's frame interval, taken from the fastest frames of the run */
export function summarizeFrames(
  frames: number[],
  longTasks: number[],
  durationMs: number,
  refreshMs = 16.7,
): FrameSummary {
  const slow = frames.filter((f) => f > refreshMs * 2.5)
  return {
    frames: frames.length,
    fps: round((frames.length / durationMs) * 1000),
    medianMs: round(median(frames)),
    p95Ms: round(quantile(frames, 0.95)),
    maxMs: round(Math.max(0, ...frames)),
    slowShare: round(slow.reduce((a, b) => a + b, 0) / Math.max(1, durationMs), 3),
    hangs: frames.filter((f) => f > 100).length,
    longTasks: longTasks.length,
    longTaskMs: round(longTasks.reduce((a, b) => a + b, 0)),
  }
}
