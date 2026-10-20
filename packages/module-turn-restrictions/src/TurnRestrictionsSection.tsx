import { moduleStorage, type Editor } from '@osm-editor-kit/maid-core'
import { m } from '@osm-editor-kit/maid-i18n'
import { osmIntersection, type Intersection } from '@osm-editor-kit/maid-model'
import {
  RELATION_CHOSEN,
  RELATION_SURFACE,
  Tooltip,
  useBearing,
  type InspectorSectionProps,
} from '@osm-editor-kit/maid-ui'
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { pickFromRoad, type FromCandidate } from './from-road.ts'
import {
  junctionSketch,
  junctionTurns,
  relatedWayIDs,
  type JunctionSketch,
  type JunctionTurn,
} from './junction.ts'
import { JunctionDiagram, turnHint } from './JunctionDiagram.tsx'
import { cycleTurn, turnStateOf, type RemovedTurn } from './turns.ts'

export type TurnRestrictionsDefaults = {
  /** Metres from the junction within which roads are looked at. iD's default is 30. */
  maxDistance: number
  /** Most via ways a restriction may have: 0 is node-only. iD's default is 0. */
  maxViaWays: number
}

export type TurnRestrictionsSectionProps = InspectorSectionProps & {
  defaults: TurnRestrictionsDefaults
}

const DISTANCES: readonly number[] = [10, 20, 30, 50, 75]
const VIA_CHOICES: readonly number[] = [0, 1, 2]
const BOX = { width: 400, height: 300, padding: 36 }

/** The choice of distance and via ways is the person's, and is kept on this device (as iD keeps it) */
const DISTANCE_KEY = 'maid:turn-restrictions:distance'
const VIA_KEY = 'maid:turn-restrictions:via'

/** The stored choice when it is one of the choices offered, else the fallback */
function storedChoice(key: string, choices: readonly number[], fallback: number): number {
  const stored = moduleStorage().getItem(key)
  const value = stored === null ? Number.NaN : Number(stored)
  return choices.includes(value) ? value : fallback
}

/** An arrow for where a road leaves the junction: two roads of one name (or of none) differ by it */
const HEADING_ARROWS: readonly string[] = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

function headingArrow(heading: number): string {
  return HEADING_ARROWS[Math.round(heading / 45) % 8] ?? ''
}

/** The history's staging graph, read as it changes (an external store: the React Compiler keeps it out of memos) */
function useStagingGraph(editor: Editor) {
  return useSyncExternalStore(
    (listener) => {
      const offs = [
        editor.history.on('stagingchange', listener),
        editor.history.on('stablechange', listener),
        editor.history.on('historyjump', listener),
      ]
      return () => offs.forEach((off) => off())
    },
    () => editor.history.staging.graph,
  )
}

/** The roads that turns can start on, with what the choice of the FROM road reads (see from-road.ts) */
function fromCandidatesOf(
  intersection: Intersection,
  sketch: JunctionSketch,
  maxVia: number,
): FromCandidate[] {
  return sketch.roads
    .filter((road) => road.canBeFrom)
    .map((road) => ({
      id: road.id,
      highway: road.highway,
      length: road.length,
      restricted: intersection
        .turns(road.id, maxVia)
        .some((turn) => turn.direct !== false && turnStateOf(turn) !== 'allowed'),
    }))
}

/**
 * The turn restrictions of a junction: a FROM road (the most important one at first, see from-road.ts), then a click on
 * a turn cycles it. The inspector keeps one section mounted while the selection moves from junction to junction, so the
 * editor is keyed by the vertex: the FROM road and the restrictions an ONLY click took away belong to one junction and
 * must not reach the next one.
 */
export function TurnRestrictionsSection(props: TurnRestrictionsSectionProps) {
  return <JunctionEditor key={props.entity.id} {...props} />
}

function JunctionEditor({ entity, editor, defaults, onRelated }: TurnRestrictionsSectionProps) {
  const graph = useStagingGraph(editor)
  // the map's turn: the sketch is drawn the way the person sees the map (north is not always up)
  const bearing = useBearing()
  const [distance, setDistance] = useState(() =>
    storedChoice(DISTANCE_KEY, DISTANCES, defaults.maxDistance),
  )
  const [maxVia, setMaxVia] = useState(() =>
    storedChoice(VIA_KEY, VIA_CHOICES, defaults.maxViaWays),
  )
  const [picked, setPicked] = useState<EntityID | null>(null)
  const [removed, setRemoved] = useState<RemovedTurn[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const captionID = useId()

  const intersection = useMemo(
    () => osmIntersection(editor.context, graph, entity.id, distance),
    [editor.context, graph, entity.id, distance],
  )
  const sketch = intersection
    ? junctionSketch(intersection, entity.id, distance, BOX, bearing)
    : undefined
  // the road the person picked, while the graph still has it as a road that turns can start on; else the first pick
  const initialFrom = useMemo(
    () =>
      intersection && sketch
        ? pickFromRoad(fromCandidatesOf(intersection, sketch, maxVia))
        : undefined,
    [intersection, sketch, maxVia],
  )
  const pickedStillThere = sketch?.roads.some((road) => road.id === picked && road.canBeFrom)
  const fromID: EntityID | null = pickedStillThere && picked ? picked : (initialFrom ?? null)
  const turns: JunctionTurn[] =
    intersection && sketch && fromID ? junctionTurns(sketch, intersection, fromID, maxVia) : []
  const hovering = turns.find((turn) => turn.key === hovered)

  // the FROM road is highlighted on the map, with the TO road and via ways of the hovered or focused turn. The graph,
  // the distance and the via ways change them without a pointer event (an undo can remove the hovered turn), so an
  // effect follows the list; it writes once per change.
  const relatedKey = relatedWayIDs(fromID, hovering).join(',')
  useEffect(
    function highlightRelatedRoads() {
      onRelated?.(relatedKey === '' ? null : (relatedKey.split(',') as EntityID[]))
    },
    [onRelated, relatedKey],
  )
  // the section goes (another junction, or the inspector closes): the highlight goes with it
  useEffect(
    function clearRelatedOnUnmount() {
      return () => onRelated?.(null)
    },
    [onRelated],
  )

  const hoverTurn = (key: string | null) => setHovered(key)

  const chooseFrom = (id: EntityID) => {
    if (id === fromID) return
    setPicked(id)
    setRemoved([])
    setHovered(null)
  }

  const click = (turn: JunctionTurn) => {
    if (!intersection || !fromID || entity.readOnly || turn.indirect) return
    const step = cycleTurn(intersection, turn.turn, fromID, removed)
    if (!step) return
    // a click makes the FROM road the person's, even when it was the one picked for them
    setPicked(fromID)
    editor.history.perform(...step.actions)
    editor.history.commit({
      annotation:
        step.annotation === 'added'
          ? m.turn_restrictions_undo_added()
          : m.turn_restrictions_undo_deleted(),
      selectedIDs: [entity.id],
    })
    setRemoved(step.removed)
  }

  const setDistanceTo = (value: number) => {
    moduleStorage().setItem(DISTANCE_KEY, String(value))
    setDistance(value)
  }
  const setViaTo = (value: number) => {
    moduleStorage().setItem(VIA_KEY, String(value))
    setMaxVia(value)
  }

  if (!intersection || !sketch) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {m.turn_restrictions_not_junction()}
      </p>
    )
  }

  // the screen reader's words for the turn under the pointer or the focus; the tooltip shows the same words
  const liveHint = hovering ? turnHint(hovering) : ''
  const fromRoads = sketch.roads.filter((road) => road.canBeFrom)

  // the quiet controls under the diagram: small, with a tooltip that says what they do (iD's help texts)
  const selectClass =
    'h-6 rounded border border-zinc-950/10 bg-white px-1.5 text-xs text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:[color-scheme:dark]'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.turn_restrictions_help_click()}</p>

      {/* one box: the FROM roads above, the junction under a divider, as they belong together */}
      <div className={`overflow-hidden rounded-md border ${RELATION_SURFACE}`}>
        <div className="flex flex-col gap-1.5 p-2">
          <span id={captionID} className="text-xs text-zinc-500 dark:text-zinc-400">
            {m.turn_restrictions_from()}
          </span>
          <div role="group" aria-labelledby={captionID} className="flex flex-wrap gap-1.5">
            {fromRoads.map((road) => (
              <button
                key={road.id}
                type="button"
                aria-pressed={road.id === fromID}
                onClick={() => chooseFrom(road.id)}
                className={`h-7 rounded-full border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  road.id === fromID
                    ? RELATION_CHOSEN
                    : 'border-zinc-950/10 bg-white text-zinc-700 hover:border-zinc-950/30 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white/30'
                }`}
              >
                <span aria-hidden="true">{headingArrow(road.heading)} </span>
                {road.name ?? m.turn_restrictions_unnamed()}
              </button>
            ))}
          </div>
        </div>

        <JunctionDiagram
          sketch={sketch}
          turns={turns}
          fromID={fromID}
          hovered={hovered}
          readOnly={entity.readOnly}
          onHover={hoverTurn}
          onChooseFrom={chooseFrom}
          onChoose={click}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <label className="flex items-center gap-1.5">
          {m.turn_restrictions_distance_label()}
          <Tooltip label={m.turn_restrictions_distance_tip()}>
            <select
              className={selectClass}
              value={distance}
              onChange={(event) => setDistanceTo(Number(event.target.value))}
            >
              {DISTANCES.map((value) => (
                <option key={value} value={value}>
                  {m.turn_restrictions_distance_value({ distance: String(value) })}
                </option>
              ))}
            </select>
          </Tooltip>
        </label>
        <label className="flex items-center gap-1.5">
          {m.turn_restrictions_via_label()}
          <Tooltip label={m.turn_restrictions_via_tip()}>
            <select
              className={selectClass}
              value={maxVia}
              onChange={(event) => setViaTo(Number(event.target.value))}
            >
              {VIA_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {value === 0
                    ? m.turn_restrictions_via_node()
                    : value === 1
                      ? m.turn_restrictions_via_one()
                      : m.turn_restrictions_via_two()}
                </option>
              ))}
            </select>
          </Tooltip>
        </label>
      </div>

      <p aria-live="polite" className="sr-only">
        {liveHint}
      </p>
    </div>
  )
}
