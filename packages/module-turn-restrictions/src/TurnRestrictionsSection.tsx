import { moduleStorage, type Editor } from '@osm-editor-kit/maid-core'
import { m } from '@osm-editor-kit/maid-i18n'
import { osmIntersection } from '@osm-editor-kit/maid-model'
import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { junctionSketch, junctionTurns, type JunctionTurn } from './junction.ts'
import { JunctionDiagram, NEXT_STATE, stateWords } from './JunctionDiagram.tsx'
import { cycleTurn, type RemovedTurn } from './turns.ts'

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
/** SVG units from the junction to where the arrows meet the roads */
const ARROW_RADIUS = 80

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

/**
 * The turn restrictions of a junction: choose the FROM road, then click the turns to cycle them. The inspector keeps
 * one section mounted while the selection moves from junction to junction, so the editor is keyed by the vertex: the
 * FROM road and the restrictions an ONLY click took away belong to one junction and must not reach the next one.
 */
export function TurnRestrictionsSection(props: TurnRestrictionsSectionProps) {
  return <JunctionEditor key={props.entity.id} {...props} />
}

function JunctionEditor({ entity, editor, defaults }: TurnRestrictionsSectionProps) {
  const graph = useStagingGraph(editor)
  const [distance, setDistance] = useState(() =>
    storedChoice(DISTANCE_KEY, DISTANCES, defaults.maxDistance),
  )
  const [maxVia, setMaxVia] = useState(() =>
    storedChoice(VIA_KEY, VIA_CHOICES, defaults.maxViaWays),
  )
  const [picked, setPicked] = useState<EntityID | null>(null)
  const [removed, setRemoved] = useState<RemovedTurn[]>([])
  const [hovered, setHovered] = useState<string | null>(null)

  const intersection = useMemo(
    () => osmIntersection(editor.context, graph, entity.id, distance),
    [editor.context, graph, entity.id, distance],
  )
  const sketch = intersection ? junctionSketch(intersection, entity.id, distance, BOX) : undefined
  // a FROM road that the graph no longer has (split, deleted) is not chosen any more
  const fromID = sketch?.roads.some((road) => road.id === picked && road.canBeFrom) ? picked : null
  const turns: JunctionTurn[] =
    intersection && sketch && fromID
      ? junctionTurns(sketch, intersection, fromID, maxVia, ARROW_RADIUS)
      : []
  const hovering = turns.find((turn) => turn.key === hovered)

  const chooseFrom = (id: EntityID) => {
    setPicked(fromID === id ? null : id)
    setRemoved([])
    setHovered(null)
  }

  const click = (turn: JunctionTurn) => {
    if (!intersection || !fromID || entity.readOnly || turn.indirect) return
    const step = cycleTurn(intersection, turn.turn, fromID, removed)
    if (!step) return
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

  const hint = hovering
    ? hovering.indirect
      ? m.turn_restrictions_indirect_hint()
      : m.turn_restrictions_hint({
          state: stateWords(hovering.state, hovering.kind),
          next: stateWords(NEXT_STATE[hovering.state], hovering.kind),
        })
    : fromID === null
      ? m.turn_restrictions_choose_from()
      : ''

  const fromRoads = sketch.roads.filter((road) => road.canBeFrom)

  const selectClass =
    'h-8 rounded-md border border-zinc-950/10 bg-white px-2 text-sm text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:[color-scheme:dark]'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.turn_restrictions_help()}</p>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          {m.turn_restrictions_distance()}
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
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          {m.turn_restrictions_via()}
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
        </label>
      </div>

      <div role="group" aria-label={m.turn_restrictions_from()} className="flex flex-wrap gap-1.5">
        {fromRoads.map((road) => (
          <button
            key={road.id}
            type="button"
            aria-pressed={road.id === fromID}
            onClick={() => chooseFrom(road.id)}
            className={`h-7 rounded-full border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-blue-500 ${
              road.id === fromID
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-zinc-950/10 text-zinc-700 hover:border-zinc-950/30 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30'
            }`}
          >
            <span aria-hidden="true">{headingArrow(road.heading)} </span>
            {road.name ?? m.turn_restrictions_unnamed()}
          </button>
        ))}
      </div>

      <JunctionDiagram
        sketch={sketch}
        turns={turns}
        fromID={fromID}
        hovered={hovered}
        readOnly={entity.readOnly}
        onHover={setHovered}
        onChooseFrom={chooseFrom}
        onChoose={click}
      />

      <p
        aria-live="polite"
        className="min-h-4 text-xs text-zinc-600 first-letter:uppercase dark:text-zinc-400"
      >
        {hint}
      </p>
    </div>
  )
}
