/**
 * The road's cross-section as an inline SVG (travel upwards), drawn from osm-lane-diagram's scene with the same
 * geometry as `sceneToSvg`, so a person can point at and choose a lane. Only the lanes and paths of the selected way
 * (role `current`) react: pointer and focus hover them (amber), a click or Enter/Space chooses one (blue) and a second
 * choice of the same lane clears it. The roads before and after are drawn dimmed. Colours are Tailwind classes with
 * `dark:` variants; the dimming veil uses the section's background (zinc-50, dark zinc-900).
 */
import type { RoadSpaceScene, SceneSlotRectKind } from '@osm-editor-kit/osm-lane-diagram'
import { useMemo, type KeyboardEvent, type ReactElement } from 'react'
import { diagramShapes, type LineShape, type SlotShape } from './shapes.ts'
import { directionArrowPath, glyphTransform, turnArrowPaths } from './turn-arrows.ts'

export type LaneDiagramProps = {
  scene: RoadSpaceScene
  /** The selected way's number (`osmNumber`): only its slots can be hovered and chosen */
  currentWayId: number
  hoveredSlotId: string | null
  chosenSlotId: string | null
  onHover: (id: string | null) => void
  onChoose: (id: string | null) => void
  /** `slot`: the name of a lane for screen readers, from its slot id */
  labels: { alt: string; slot?: (slotId: string) => string }
}

const KIND_FILL: Record<SceneSlotRectKind | 'sibling', string> = {
  motor: 'fill-zinc-300 dark:fill-zinc-600',
  bus: 'fill-amber-200 dark:fill-amber-800',
  cycle: 'fill-teal-300 dark:fill-teal-700',
  both_ways: 'fill-rose-300 dark:fill-rose-800',
  sidewalk: 'fill-stone-200 dark:fill-stone-700',
  shared_path: 'fill-emerald-200 dark:fill-emerald-800',
  median: 'fill-lime-200 dark:fill-lime-900',
  sibling: 'fill-zinc-200 dark:fill-zinc-700',
}
const MEDIAN_FILL = {
  verge: 'fill-lime-200 dark:fill-lime-900',
  crossing: 'fill-stone-100 dark:fill-stone-800',
}

const LINE_STROKE: Record<LineShape['kind'], string> = {
  kerb: 'stroke-stone-700 dark:stroke-stone-300',
  outer_edge: 'stroke-stone-400 dark:stroke-stone-500',
  separator: 'stroke-zinc-500 dark:stroke-zinc-400',
  centreline: 'stroke-zinc-700 dark:stroke-zinc-300',
  placement_guide: 'stroke-violet-500 dark:stroke-violet-400',
  sibling_placement_guide: 'stroke-violet-500 dark:stroke-violet-400',
  segment_boundary: 'stroke-zinc-300 dark:stroke-zinc-700',
}
const LINE_WIDTH: Record<LineShape['kind'], number> = {
  kerb: 2.25,
  outer_edge: 1.25,
  separator: 1.5,
  centreline: 1.25,
  placement_guide: 4,
  sibling_placement_guide: 2.5,
  segment_boundary: 0.75,
}

/** The section's background: dims the neighbours' bands when laid over them */
const VEIL = 'fill-zinc-50 dark:fill-zinc-900'
const GLYPH = 'stroke-zinc-900 dark:stroke-zinc-100'
const HOVERED = 'stroke-amber-500 dark:stroke-amber-400'
const CHOSEN = 'stroke-blue-600 dark:stroke-blue-400'

function Line({ line }: { line: LineShape }): ReactElement {
  const round = line.kind === 'kerb' || line.kind === 'outer_edge'
  return (
    <polyline
      className={LINE_STROKE[line.kind]}
      fill="none"
      strokeWidth={LINE_WIDTH[line.kind]}
      strokeDasharray={line.dashed ? '4 3' : undefined}
      strokeLinecap={round ? 'round' : undefined}
      strokeLinejoin={round ? 'round' : undefined}
      points={line.points}
    />
  )
}

/** The turn arrows of a lane, or its direction of travel when it has no turn value */
function Glyph({ slot }: { slot: SlotShape }): ReactElement | null {
  if (!slot.glyph) return null
  const turns = turnArrowPaths(slot.turn).paths.map((p) => p.d)
  const direction = directionArrowPath(slot.direction)
  const paths = turns.length > 0 ? turns : direction ? [direction] : []
  if (paths.length === 0) return null
  return (
    <g
      transform={glyphTransform(slot.glyph.cx, slot.glyph.cy, slot.glyph.size, slot.direction)}
      opacity={turns.length > 0 ? 0.9 : 0.6}
      pointerEvents="none"
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          className={GLYPH}
          fill="none"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

/** The slot's outline and pointer target: transparent until hovered or chosen */
function SlotTarget({
  slot,
  hovered,
  chosen,
  onHover,
  onChoose,
  label,
}: {
  slot: SlotShape
  hovered: boolean
  chosen: boolean
  label: string
  onHover: (id: string | null) => void
  onChoose: (id: string | null) => void
}): ReactElement {
  const toggle = () => onChoose(chosen ? null : slot.slotId)
  const onKeyDown = (event: KeyboardEvent<SVGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggle()
  }
  const state = chosen ? CHOSEN : hovered ? HOVERED : 'stroke-transparent'
  const common = {
    className: `cursor-pointer fill-transparent outline-none focus-visible:stroke-blue-500 ${state}`,
    strokeWidth: chosen || hovered ? 2.5 : 2,
    tabIndex: 0,
    role: 'button',
    'aria-label': label,
    'data-lane-slot': slot.slotId,
    'aria-pressed': chosen,
    onPointerEnter: () => onHover(slot.slotId),
    onPointerLeave: () => onHover(null),
    onFocus: () => onHover(slot.slotId),
    onBlur: () => onHover(null),
    onClick: toggle,
    onKeyDown,
  }
  // inset by half the stroke so the outline stays inside the lane and neighbours' outlines do not overlap
  return slot.points ? (
    <polygon points={slot.points} {...common} />
  ) : (
    <rect
      x={slot.x + 1.25}
      y={slot.y + 1.25}
      width={Math.max(0, slot.width - 2.5)}
      height={Math.max(0, slot.height - 2.5)}
      rx={2}
      {...common}
    />
  )
}

export function LaneDiagram({
  scene,
  currentWayId,
  hoveredSlotId,
  chosenSlotId,
  onHover,
  onChoose,
  labels,
}: LaneDiagramProps): ReactElement {
  const shapes = useMemo(() => diagramShapes(scene, currentWayId), [scene, currentWayId])
  const targets = shapes.slots.filter((s) => s.interactive)
  // the chosen outline on top of the hovered one
  const ordered = targets.toSorted(
    (a, b) => Number(a.slotId === chosenSlotId) - Number(b.slotId === chosenSlotId),
  )

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role="group"
      aria-label={labels.alt}
      width={shapes.width}
      height={shapes.height}
      viewBox={`0 0 ${shapes.width} ${shapes.height}`}
      className="mx-auto h-auto max-w-full select-none"
      data-lanes-diagram=""
    >
      <g pointerEvents="none">
        {shapes.plates.map((points, i) => (
          <polygon
            key={i}
            points={points}
            className="fill-zinc-200 dark:fill-zinc-800"
            opacity={0.55}
          />
        ))}
        {shapes.junctions.map((j, i) => (
          <g key={i}>
            <rect
              x={0}
              y={j.y}
              width={shapes.width}
              height={j.height}
              className="fill-zinc-200 dark:fill-zinc-800"
              opacity={0.6}
            />
            {[j.y, j.y + j.height].map((y) => (
              <line
                key={y}
                x1={0}
                y1={y}
                x2={shapes.width}
                y2={y}
                className={LINE_STROKE.segment_boundary}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ))}
          </g>
        ))}
        {shapes.boundaries.map((line) => (
          <Line key={line.key} line={line} />
        ))}
        {shapes.ribbons.map((ribbon) => (
          <polygon
            key={ribbon.key}
            points={ribbon.points}
            className={KIND_FILL[ribbon.kind]}
            opacity={ribbon.kind === 'sibling' ? 0.7 : 1}
          />
        ))}
        {shapes.medians.map((median, i) => (
          <polygon key={i} points={median.points} className={MEDIAN_FILL[median.medianHint]} />
        ))}
        {shapes.fills.map((fill) => {
          const className =
            fill.kind === 'median' ? MEDIAN_FILL[fill.medianHint ?? 'verge'] : KIND_FILL[fill.kind]
          const opacity = fill.kind === 'sibling' ? 0.7 : 1
          return fill.points ? (
            <polygon key={fill.key} points={fill.points} className={className} opacity={opacity} />
          ) : (
            <rect
              key={fill.key}
              x={fill.x}
              y={fill.y}
              width={fill.width}
              height={fill.height}
              className={className}
              opacity={opacity}
            />
          )
        })}
        {shapes.lines.map((line) => (
          <Line key={line.key} line={line} />
        ))}
        {shapes.slots.map((slot) => (
          <Glyph key={slot.key} slot={slot} />
        ))}
        {shapes.guides.map((guide) => (
          <g key={guide.key} opacity={guide.sibling ? 0.4 : 0.55}>
            <polyline
              className={LINE_STROKE.placement_guide}
              fill="none"
              strokeWidth={guide.sibling ? 2.5 : 4}
              strokeLinecap={guide.sibling ? 'round' : undefined}
              points={guide.points}
            />
            {guide.arrow && (
              <polyline
                className={LINE_STROKE.placement_guide}
                fill="none"
                strokeWidth={guide.sibling ? 1.75 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={guide.arrow}
              />
            )}
          </g>
        ))}
        {shapes.dimBands.map((band, i) => (
          <rect
            key={i}
            x={0}
            y={band.y}
            width={shapes.width}
            height={band.height}
            className={VEIL}
            opacity={0.5}
          />
        ))}
      </g>
      {ordered.map((slot) => (
        <SlotTarget
          key={slot.key}
          slot={slot}
          hovered={slot.slotId === hoveredSlotId}
          chosen={slot.slotId === chosenSlotId}
          onHover={onHover}
          onChoose={onChoose}
          label={labels.slot?.(slot.slotId) ?? slot.slotId}
        />
      ))}
    </svg>
  )
}
