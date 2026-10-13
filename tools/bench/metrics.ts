/**
 * The measurements that the reports and `bun run bench-budget` read from a run's results: one row per measurement.
 * `id` is stable: tools/bench/budget.json refers to it, so do not rename one without updating that file.
 */
import type { RunResult } from './run'
import { median } from './stats'

export type Row = {
  id: string
  label: string
  unit: string
  better: 'low' | 'high' | 'none'
  get: (r: RunResult) => number | undefined
  /** The phase that measures it: when the run says the phase did not run, the report says "not measured" */
  phase?: string
  /** false: shown and kept in the budget as a warning only, not compared with iD and Rapid in the same run */
  compare?: boolean
}

function medianOf(values: number[] | undefined) {
  return values && values.length ? median(values) : undefined
}

/** Frames per second per main-thread work: what the editor spends per second of animation */
const cpuPerSecond = (s: { cpuMs: number; frames: number; fps: number } | undefined) =>
  s ? Math.round(s.cpuMs / (s.frames / Math.max(1, s.fps))) : undefined

export const ROWS: Row[] = [
  {
    // the map shows the complete data for the view. Runs before drawnMs was recorded have only settledMs: used instead
    id: 'load-drawn',
    label: 'Loaded: map drawn',
    unit: 'ms',
    better: 'low',
    get: (r) => r.load?.drawnMs ?? r.load?.settledMs,
  },
  {
    id: 'load-settled',
    label: 'Loaded: everything fetched',
    unit: 'ms',
    better: 'low',
    compare: false,
    get: (r) => r.load?.settledMs,
  },
  {
    id: 'load-cpu',
    label: 'Load: main-thread work',
    unit: 'ms',
    better: 'low',
    get: (r) => r.load?.cpuMs,
  },
  {
    id: 'pan-cold-p95',
    label: 'Pan into new data: frame time p95',
    unit: 'ms',
    better: 'low',
    get: (r) => r.panCold?.p95Ms,
  },
  {
    id: 'pan-cold-max',
    label: 'Pan into new data: worst frame',
    unit: 'ms',
    better: 'low',
    get: (r) => r.panCold?.maxMs,
  },
  {
    id: 'pan-cold-settle',
    label: 'Pan into new data: until correct afterwards',
    unit: 'ms',
    better: 'low',
    compare: false,
    get: (r) => r.panCold?.settleMs,
  },
  {
    id: 'pan-warm-p95',
    label: 'Pan over loaded data: frame time p95',
    unit: 'ms',
    better: 'low',
    get: (r) => r.panWarm?.p95Ms,
  },
  {
    id: 'pan-warm-max',
    label: 'Pan over loaded data: worst frame',
    unit: 'ms',
    better: 'low',
    get: (r) => r.panWarm?.maxMs,
  },
  {
    id: 'pan-warm-fps',
    label: 'Pan over loaded data: frames per second',
    unit: '',
    better: 'high',
    get: (r) => r.panWarm?.fps,
  },
  {
    id: 'pan-warm-cpu',
    label: 'Pan over loaded data: main-thread work per second',
    unit: 'ms',
    better: 'low',
    get: (r) => cpuPerSecond(r.panWarm),
  },
  {
    id: 'pan-warm-settle',
    label: 'Pan over loaded data: until correct afterwards',
    unit: 'ms',
    better: 'low',
    compare: false,
    get: (r) => r.panWarm?.settleMs,
  },
  {
    id: 'zoom-in-p95',
    label: 'Zoom in: frame time p95',
    unit: 'ms',
    better: 'low',
    get: (r) => r.zoomIn?.p95Ms,
  },
  {
    id: 'zoom-in-max',
    label: 'Zoom in: worst frame',
    unit: 'ms',
    better: 'low',
    get: (r) => r.zoomIn?.maxMs,
  },
  {
    id: 'zoom-in-settle',
    label: 'Zoom in: until correct afterwards',
    unit: 'ms',
    better: 'low',
    compare: false,
    get: (r) => r.zoomIn?.settleMs,
  },
  {
    id: 'zoom-out-p95',
    label: 'Zoom out: frame time p95',
    unit: 'ms',
    better: 'low',
    get: (r) => r.zoomOut?.p95Ms,
  },
  {
    id: 'zoom-out-settle',
    label: 'Zoom out: until correct afterwards',
    unit: 'ms',
    better: 'low',
    compare: false,
    get: (r) => r.zoomOut?.settleMs,
  },
  {
    id: 'hover-latency',
    label: 'Hover: pointer move to highlight',
    unit: 'ms',
    better: 'low',
    get: (r) => medianOf(r.hoverLatencyMs?.filter((v) => v >= 0)),
  },
  {
    id: 'hover-sweep-p95',
    label: 'Hover sweep: frame time p95',
    unit: 'ms',
    better: 'low',
    get: (r) => r.hoverSweep?.p95Ms,
  },
  {
    id: 'hover-sweep-fps',
    label: 'Hover sweep: frames per second',
    unit: '',
    better: 'high',
    get: (r) => r.hoverSweep?.fps,
  },
  {
    id: 'hover-sweep-cpu',
    label: 'Hover sweep: main-thread work per second',
    unit: 'ms',
    better: 'low',
    get: (r) => cpuPerSecond(r.hoverSweep),
  },
  {
    id: 'select-api',
    label: 'Select a way through the API: until drawn',
    unit: 'ms',
    better: 'low',
    get: (r) => medianOf(r.selectMs),
  },
  {
    id: 'drag-fps',
    label: 'Drag a vertex: frames per second',
    unit: '',
    better: 'high',
    get: (r) => r.dragVertex?.fps,
  },
  {
    id: 'drag-p95',
    label: 'Drag a vertex: frame time p95',
    unit: 'ms',
    better: 'low',
    get: (r) => r.dragVertex?.p95Ms,
  },
  {
    id: 'drag-max',
    label: 'Drag a vertex: worst frame',
    unit: 'ms',
    better: 'low',
    get: (r) => r.dragVertex?.maxMs,
  },
  {
    id: 'drag-cpu',
    label: 'Drag a vertex: main-thread work per second',
    unit: 'ms',
    better: 'low',
    get: (r) => cpuPerSecond(r.dragVertex),
  },
  {
    id: 'drag-settle',
    label: 'Drag a vertex: until correct after release',
    unit: 'ms',
    better: 'low',
    compare: false,
    get: (r) => r.dragVertex?.settleMs,
  },
  {
    id: 'drag-node-median',
    label: 'Drag a vertex, input to paint per step: median',
    unit: 'ms',
    better: 'low',
    phase: 'dragNode',
    get: (r) => r.dragNode?.latencyMedianMs,
  },
  {
    id: 'drag-node-p95',
    label: 'Drag a vertex, input to paint per step: p95',
    unit: 'ms',
    better: 'low',
    phase: 'dragNode',
    get: (r) => r.dragNode?.latencyP95Ms,
  },
  {
    id: 'tag-edit-median',
    label: 'Tag edit: call to paint, median',
    unit: 'ms',
    better: 'low',
    phase: 'tagEdit',
    get: (r) => r.tagEdit?.latencyMedianMs,
  },
  {
    id: 'tag-edit-p95',
    label: 'Tag edit: call to paint, p95',
    unit: 'ms',
    better: 'low',
    phase: 'tagEdit',
    get: (r) => r.tagEdit?.latencyP95Ms,
  },
  {
    id: 'undo-median',
    label: 'Undo: call to paint, median',
    unit: 'ms',
    better: 'low',
    phase: 'undoRedo',
    get: (r) => r.undoRedo?.undo.latencyMedianMs,
  },
  {
    id: 'redo-median',
    label: 'Redo: call to paint, median',
    unit: 'ms',
    better: 'low',
    phase: 'undoRedo',
    get: (r) => r.undoRedo?.redo.latencyMedianMs,
  },
  {
    id: 'select-click-median',
    label: 'Select by a click: release to paint, median',
    unit: 'ms',
    better: 'low',
    phase: 'selectLatency',
    get: (r) => r.selectLatency?.latencyMedianMs,
  },
  {
    id: 'select-click-p95',
    label: 'Select by a click: release to paint, p95',
    unit: 'ms',
    better: 'low',
    phase: 'selectLatency',
    get: (r) => r.selectLatency?.latencyP95Ms,
  },
  { id: 'heap', label: 'JS heap after the run', unit: 'MB', better: 'low', get: (r) => r.heapMb },
]

/**
 * The column of a result: the editor, the Maid app when it is not the default one, and the variant. Results from before
 * `app` existed count as the default app.
 */
export function columnOf(r: RunResult) {
  const app = r.editor === 'maid' && r.app && r.app !== 'maid' ? ` ${r.app}` : ''
  const variant = r.variant === 'default' ? '' : ` (${r.variant})`
  return `${r.editor}${app}${variant}`
}
