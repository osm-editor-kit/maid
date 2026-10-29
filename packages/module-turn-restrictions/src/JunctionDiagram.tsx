import { device, m } from '@osm-editor-kit/maid-i18n'
import { Tooltip } from '@osm-editor-kit/maid-ui'
import type { ReactNode } from 'react'
import { roadLook, type JunctionSketch, type JunctionTurn, type Point } from './junction.ts'
import type { TurnKind, TurnState } from './turns.ts'

/** The word of a turn kind ("left turn"), as the texts say it in lower case */
export function turnWord(kind: TurnKind | undefined): string {
  if (kind === 'left_turn') return m.turn_restrictions_turn_left()
  if (kind === 'right_turn') return m.turn_restrictions_turn_right()
  if (kind === 'u_turn') return m.turn_restrictions_turn_u()
  if (kind === 'straight_on') return m.turn_restrictions_turn_straight()
  return m.turn_restrictions_turn_any()
}

/** The state of a turn in words: "No left turn", "Only left turn", "Left turn allowed" */
export function stateWords(state: TurnState, kind: TurnKind | undefined): string {
  const turn = turnWord(kind)
  if (state === 'restricted') return m.turn_restrictions_state_no({ turn })
  if (state === 'only') return m.turn_restrictions_state_only({ turn })
  return m.turn_restrictions_state_allowed({ turn })
}

/** The state a click leads to: allowed -> no -> only -> allowed (iD) */
export const NEXT_STATE: Record<TurnState, TurnState> = {
  allowed: 'restricted',
  restricted: 'only',
  only: 'allowed',
}

/**
 * What a turn's button says on hover or focus: its state and what a click does ("No left turn. Click for: Only left
 * turn"), or the note of an indirect restriction. It is the one place of this text: a tooltip on the button, and the
 * screen reader's live region of the section.
 */
export function turnHint(turn: JunctionTurn): string {
  if (turn.indirect) return m.turn_restrictions_indirect_hint()
  return m.turn_restrictions_hint({
    state: stateWords(turn.state, turn.kind),
    next: stateWords(NEXT_STATE[turn.state], turn.kind),
    ...device(),
  })
}

const STATE_CLASS: Record<TurnState, { stroke: string; badge: string; glyph: string | undefined }> =
  {
    allowed: { stroke: 'stroke-emerald-600', badge: 'bg-emerald-600', glyph: '✓' },
    restricted: { stroke: 'stroke-red-600', badge: 'bg-red-600', glyph: '✕' },
    // blue as iD's turn-only arrows: violet is the relation's own colour (the FROM halo)
    only: { stroke: 'stroke-blue-600', badge: 'bg-blue-600', glyph: undefined },
  }

/** The sign on a turn's button, so that its state is not told by colour alone; the word ONLY is a text */
function glyphOf(state: TurnState): string {
  return STATE_CLASS[state].glyph ?? m.turn_restrictions_badge_only()
}

/** The width of the FROM road's halo, and of the halo under each turn arrow, in SVG units */
const FROM_HALO_WIDTH = 20
const TURN_HALO_WIDTH = 7

/** A polyline's points attribute */
function pointsOf(points: readonly Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

export type JunctionDiagramProps = {
  sketch: JunctionSketch
  /** The turns of the chosen FROM road (empty until one is chosen) */
  turns: readonly JunctionTurn[]
  fromID: EntityID | null
  hovered: string | null
  readOnly: boolean
  onHover: (key: string | null) => void
  /** A click on a road that turns can start on chooses it as FROM, as in iD; the keyboard has the buttons above */
  onChooseFrom: (id: EntityID) => void
  onChoose: (turn: JunctionTurn) => void
}

/**
 * The junction: the roads as wide strokes with a casing, in the colours of their highway class (the map's), the FROM
 * road under a violet halo (relation-tone.ts), the turns of the FROM road as arrows, and a button at the end of each
 * arrow on its TO road (keyboard reachable). The button's tooltip says the turn's state and what a click does. The
 * diagram sits in the section's box (RELATION_SURFACE) under a divider. A read-only junction keeps its buttons
 * focusable (aria-disabled, not disabled), so that the tooltips still show.
 */
export function JunctionDiagram({
  sketch,
  turns,
  fromID,
  hovered,
  readOnly,
  onHover,
  onChooseFrom,
  onChoose,
}: JunctionDiagramProps): ReactNode {
  const { width, height } = sketch
  const nameOf = (id: EntityID) =>
    sketch.roads.find((road) => road.id === id)?.name ?? m.turn_restrictions_unnamed()

  return (
    <div
      className="relative w-full border-t border-violet-950/10 dark:border-white/10"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        {/* the FROM road's halo, under the roads as iD's grey halo marks its FROM way; violet as relation editing */}
        {sketch.roads
          .filter((road) => road.id === fromID)
          .map((road) => (
            <polyline
              key={`halo-${road.id}`}
              points={pointsOf(road.points)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={FROM_HALO_WIDTH}
              className="stroke-violet-500/45 dark:stroke-violet-400/45"
            />
          ))}
        {/* the casings first, so that a casing never covers another road's fill where two roads meet */}
        {sketch.roads.map((road) => {
          const look = roadLook(road.highway)
          if (!look.casing) return null
          return (
            <polyline
              key={`casing-${road.id}`}
              points={pointsOf(road.points)}
              fill="none"
              stroke={look.casing}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={look.casingWidth}
            />
          )
        })}
        {/* the fills: solid up to the road's real end, dashed on a stub past it (see JunctionRoad.dataEnd) */}
        {sketch.roads.map((road) => {
          const look = roadLook(road.highway)
          const hasStub = road.points.length > road.dataEnd + 1
          return (
            <g key={road.id}>
              <polyline
                points={pointsOf(road.points.slice(0, road.dataEnd + 1))}
                fill="none"
                stroke={look.fill}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={look.width}
                strokeDasharray={look.dashed ? '5 4' : undefined}
              />
              {hasStub ? (
                <polyline
                  points={pointsOf(road.points.slice(road.dataEnd))}
                  fill="none"
                  stroke={look.fill}
                  strokeLinecap="butt"
                  strokeWidth={look.width}
                  strokeDasharray="3 3"
                  opacity={0.8}
                />
              ) : null}
            </g>
          )
        })}
        {sketch.roads
          .filter((road) => road.canBeFrom)
          .map((road) => (
            <polyline
              key={road.id}
              points={pointsOf(road.points)}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              className="cursor-pointer"
              onClick={() => onChooseFrom(road.id)}
            />
          ))}
        {/* each arrow has a halo in the box's colour, so that it reads over the roads in both themes */}
        {turns.map((turn) => (
          <path
            key={`halo-${turn.key}`}
            d={turn.path}
            fill="none"
            strokeWidth={TURN_HALO_WIDTH}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={hovered === null || hovered === turn.key ? 1 : 0.35}
            className="stroke-violet-50 dark:stroke-[color-mix(in_srgb,var(--color-violet-950)_40%,var(--color-zinc-950))]"
          />
        ))}
        {turns.map((turn) => (
          <path
            key={turn.key}
            d={turn.path}
            fill="none"
            strokeWidth={hovered === turn.key ? 5 : 3.5}
            strokeDasharray={turn.indirect ? '4 4' : undefined}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={hovered === null || hovered === turn.key ? 1 : 0.35}
            className={STATE_CLASS[turn.state].stroke}
          />
        ))}
      </svg>

      {turns.map((turn) => {
        const from = nameOf(turn.from)
        const to = nameOf(turn.to)
        return (
          <Tooltip key={turn.key} label={turnHint(turn)}>
            <button
              type="button"
              aria-disabled={readOnly || turn.indirect || undefined}
              aria-label={m.turn_restrictions_aria_turn({
                from,
                to,
                state: stateWords(turn.state, turn.kind),
              })}
              onMouseEnter={() => onHover(turn.key)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(turn.key)}
              onBlur={() => onHover(null)}
              onClick={() => onChoose(turn)}
              style={{
                left: `${(turn.at[0] / width) * 100}%`,
                top: `${(turn.at[1] / height) * 100}%`,
              }}
              className={`absolute grid h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full px-1.5 text-[11px] leading-none font-semibold text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 aria-disabled:cursor-default aria-disabled:opacity-60 ${STATE_CLASS[turn.state].badge} ${hovered === turn.key ? 'ring-2 ring-white dark:ring-zinc-900' : ''}`}
            >
              <span aria-hidden="true">{glyphOf(turn.state)}</span>
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
