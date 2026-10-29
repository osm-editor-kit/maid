// The divide mode on the map: the preview (dashed outlines of the parts, a GeoJSON source) and the panel at the top centre,
// which is DOM inside the map, as the measure's pill is. Registered on `map.content` (module.ts). The panel's keys
// (+ and - for the columns, Shift for the rows, Enter) are taken here in the capture phase, as the engine takes Enter.
import type { Editor } from '@osm-editor-kit/maid-core'
import { device } from '@osm-editor-kit/maid-i18n'
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import { isTextField, type MapContentProps } from '@osm-editor-kit/maid-renderer'
import { autoFocusFields, INPUT_CLASS, PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import type { Feature, FeatureCollection, LineString } from 'geojson'
import { useEffect, useReducer, useRef, useSyncExternalStore } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { formatNumber, m } from '../messages.ts'
import {
  divideActions,
  useDivideColumns,
  useDivideRefusal,
  useDivideRows,
  useDivideWayId,
} from './divide-store.ts'
import { cornersOfWay, divideCells, type Corners } from './divide.ts'
import { largestFor, refusalText, stepOfKey, type Division } from './division.ts'
import { divisionSizes, type Size } from './measure.ts'
import { confirmDivision, DIVIDE_MODE_ID } from './mode.ts'

const SOURCE = 'divide-preview'
const LAYER = 'divide-preview-lines'
/** The panel's marker attribute: the keys of the mode are the panel's only where the focus is inside it */
const PANEL_SELECTOR = '[data-divide-panel]'
/**
 * Events the panel does not pass on to the map: a drag in a field must not pan the map, and a press on a button must not
 * reach the map's selection. A click is not in the list: the map sees it while the mode is on, and does nothing with it.
 */
const KEPT_FROM_MAP = ['mousedown', 'pointerdown', 'touchstart', 'dblclick', 'wheel'] as const
const noSubscribe = () => () => {}

/** The dashed outline of each part, as a closed line, in the order the parts are made */
function previewOf(corners: Corners, division: Division): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: divideCells(corners, division.columns, division.rows).map(
      (cell): Feature<LineString> => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [...cell, ...cell.slice(0, 1)] },
      }),
    ),
  }
}

/** The graph of the editor, read again on each change of the history (a new object per change) */
function useStagingGraph(editor: Editor) {
  const [, changed] = useReducer((count: number) => count + 1, 0)
  useEffect(
    function listenToHistory() {
      const stops = [
        editor.history.on('stagingchange', changed),
        editor.history.on('historyjump', changed),
      ]
      return () => {
        for (const stop of stops) stop()
      }
    },
    [editor],
  )
  return editor.history.staging.graph
}

/**
 * The mode's keys while it is on. Outside a text field: + - and Shift change the numbers; Enter is the engine's
 * (onKey). Inside the panel's own field: the same keys change the numbers, and Enter applies here, because the engine
 * does not take Enter from a field. A key in another field is not ours.
 */
function onKeyOfPanel(event: KeyboardEvent, bound: OperationHost): void {
  if (bound.engine.moduleMode?.id !== DIVIDE_MODE_ID) return
  const { target } = event
  const inPanel = target instanceof Element && target.closest(PANEL_SELECTOR) !== null
  if (!inPanel && isTextField(target)) return
  const step = stepOfKey(event)
  if (step) {
    event.preventDefault()
    event.stopPropagation()
    divideActions().step(step.axis, step.delta)
    return
  }
  if (event.key === 'Enter' && inPanel && isTextField(target)) {
    event.preventDefault()
    event.stopPropagation()
    confirmDivision(bound)
  }
}

export function DivideOnMap({ editor, engine }: MapContentProps) {
  const active = useSyncExternalStore(
    engine?.subscribe ?? noSubscribe,
    () => engine?.moduleMode?.id === DIVIDE_MODE_ID,
  )
  const wayId = useDivideWayId()
  const columns = useDivideColumns()
  const rows = useDivideRows()
  const refusal = useDivideRefusal()
  const graph = useStagingGraph(editor)
  const shown = active && wayId !== undefined && engine !== undefined

  useEffect(
    function takeTheKeys() {
      if (!shown || !engine) return
      const bound = { editor, engine }
      const onKey = (event: KeyboardEvent) => onKeyOfPanel(event, bound)
      window.addEventListener('keydown', onKey, true)
      return () => window.removeEventListener('keydown', onKey, true)
    },
    [shown, editor, engine],
  )

  const panel = useRef<HTMLDivElement>(null)
  useEffect(
    function keepPanelEvents() {
      const element = panel.current
      if (!shown || !element) return
      const keep = (event: Event) => event.stopPropagation()
      for (const type of KEPT_FROM_MAP) element.addEventListener(type, keep)
      return () => {
        for (const type of KEPT_FROM_MAP) element.removeEventListener(type, keep)
      }
    },
    [shown],
  )

  if (!shown || wayId === undefined || !engine) return null
  const division = { columns, rows }
  const corners = cornersOfWay(graph, wayId)
  const count = columns * rows
  return (
    <>
      {corners && (
        <>
          <Source id={SOURCE} type="geojson" data={previewOf(corners, division)} />
          <Layer
            id={LAYER}
            type="line"
            source={SOURCE}
            paint={{ 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [2, 2] }}
          />
        </>
      )}
      <div
        ref={panel}
        data-divide-panel
        className="pointer-events-auto absolute top-3 left-1/2 z-30 w-72 -translate-x-1/2 rounded-xl bg-white p-3 text-sm text-zinc-800 shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
      >
        <h2 className="font-medium">{m.divide_title()}</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            {m.divide_columns()}
            <input
              {...PLAIN_INPUT}
              type="number"
              min={1}
              // the panel opens with the columns field focused: type a number or use the arrows, then Enter
              // (on a touch device the field waits for the tap: its keyboard would cover the map)
              autoFocus={autoFocusFields()}
              max={largestFor('columns', division)}
              step={1}
              value={columns}
              onChange={(event) =>
                divideActions().set('columns', event.currentTarget.valueAsNumber)
              }
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            {m.divide_rows()}
            <input
              {...PLAIN_INPUT}
              type="number"
              min={1}
              max={largestFor('rows', division)}
              step={1}
              value={rows}
              onChange={(event) => divideActions().set('rows', event.currentTarget.valueAsNumber)}
              className={INPUT_CLASS}
            />
          </label>
        </div>
        <p className="mt-2 font-medium">
          {count === 1 ? m.divide_count_one() : m.divide_count({ count })}
        </p>
        {corners && <Sizes corners={corners} columns={columns} rows={rows} />}
        {refusal && (
          <p role="alert" className="mt-2 text-amber-700 dark:text-amber-400">
            {refusalText(refusal)}
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {m.divide_hint({ ...device() })}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => engine.exitModuleMode(DIVIDE_MODE_ID)}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-200 dark:ring-white/10 dark:hover:bg-white/10"
          >
            {m.divide_cancel()}
          </button>
          <button
            type="button"
            onClick={() => confirmDivision({ editor, engine })}
            className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {m.divide_apply()}
          </button>
        </div>
      </div>
    </>
  )
}

/** Length × width and area of a shape, in the app's language */
function sizeText(size: Size) {
  return m.divide_size({
    length: formatNumber(size.length),
    width: formatNumber(size.width),
    area: formatNumber(size.area),
  })
}

/**
 * The size of the whole and of each part. Parts of a rectangle or a parallelogram are all alike; parts of a trapezoid
 * differ, and then their areas are shown as a range.
 */
function Sizes({ corners, columns, rows }: { corners: Corners; columns: number; rows: number }) {
  const { whole, smallest, largest } = divisionSizes(corners, columns, rows)
  const alike = largest.area - smallest.area <= largest.area * 0.01
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-zinc-600 tabular-nums dark:text-zinc-300">
      <dt>{m.divide_whole()}</dt>
      <dd>{sizeText(whole)}</dd>
      <dt>{alike ? m.divide_each() : m.divide_parts()}</dt>
      <dd>
        {alike
          ? sizeText(largest)
          : m.divide_area_range({
              smallest: formatNumber(smallest.area),
              largest: formatNumber(largest.area),
            })}
      </dd>
    </dl>
  )
}
