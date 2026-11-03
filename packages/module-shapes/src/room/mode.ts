import type { Editor } from '@osm-editor-kit/maid-core'
/**
 * The mode that takes the pointer while a room is drawn into the selected building (ADR 0011, hook 4). The fixed
 * points are kept as positions, so a pan between two clicks changes nothing; each event projects them and the building
 * to the screen and asks draft.ts what the pointer means. The room itself comes from the cut's split-off plan
 * (cut/cut.ts): the building keeps its shape and gets the two wall nodes, the room shares them. Escape ends the mode
 * with nothing written (the engine does that); Backspace takes the last point back; Enter ends the room as the preview
 * shows it.
 */
import { device } from '@osm-editor-kit/maid-i18n'
import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { type MaidEngine, type ModuleMode, SNAP_PX } from '@osm-editor-kit/maid-renderer'
import { splitOffPlan, splitOffPreview } from '../cut/cut.ts'
import { refusalText } from '../cut/texts.ts'
import { formatMetres, m } from '../messages.ts'
import { frameAt, toMetres, type Loc } from '../shared/metres.ts'
import { distance, type Pt } from '../shared/vector.ts'
import { type Draft, type DraftPointer, lineOf, pointerOf } from './draft.ts'
import { type RoomPreview, roomActions } from './room-store.ts'

/** The id of the tool and of its mode: the button is shown pressed while the mode is on */
export const ROOM_ID = 'room'

/** The tags of a new room; the level being edited is added (engine.levelTags) */
export const ROOM_TAGS = { indoor: 'room' } as const

/** The outline of a way as positions, without the closing repeat; undefined when a node is missing */
function outlineOf(editor: Editor, wayId: string): Loc[] | undefined {
  const graph = editor.history.staging.graph
  const way = graph.hasEntity(wayId)
  if (!(way instanceof OsmWay)) return undefined
  const locs: Loc[] = []
  for (const id of way.nodes.slice(0, -1)) {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return undefined
    locs.push(node.loc)
  }
  return locs
}

/** The length on the ground between two positions, as a label text */
function lengthOf(a: Loc, b: Loc): string {
  const frame = frameAt([a, b])
  return formatMetres(distance(toMetres(frame, a), toMetres(frame, b)))
}

/** The middle of two positions */
function middle(a: Loc, b: Loc): Loc {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/**
 * The mode for one room in one building.
 * @param   editor - The editor, for the data and the history
 * @param   engine - The engine, for the map and the level
 * @param   wayId  - The building's closed way (for a multipolygon, its outer way)
 * @return  The module mode
 */
export function roomMode(editor: Editor, engine: MaidEngine, wayId: string): ModuleMode {
  /** The fixed points, the first on the wall */
  let points: Loc[] = []
  /** The wall edge the room started on, for the angle of the first segment */
  let startEdge = 0
  /** The line the last pointer event gave, for Enter */
  let lastLine: Loc[] | undefined

  /** The building and the points on the screen now, and the way back to positions */
  const screen = () => {
    const map = engine.map
    const outline = outlineOf(editor, wayId)
    if (!map || !outline) return undefined
    const project = (loc: Loc): Pt => {
      const p = map.project(loc)
      return { x: p.x, y: p.y }
    }
    const unproject = (p: Pt): Loc => {
      const loc = map.unproject([p.x, p.y])
      return [loc.lng, loc.lat]
    }
    const draft: Draft = { points: points.map(project), startEdge }
    return { ring: outline.map(project), draft, project, unproject }
  }

  /** What the pointer at this position means now, and the preview it gives */
  const read = (lon: number, lat: number) => {
    const view = screen()
    if (!view) return undefined
    const keys = { shift: engine.modifiers.shift, alt: engine.modifiers.alt }
    const pointer = pointerOf(view.draft, view.project([lon, lat]), view.ring, keys, SNAP_PX)
    const line = lineOf(view.draft, pointer)?.map(view.unproject)
    return { view, pointer, line }
  }

  /** Shows what the pointer gives: the wall point, the line, the guides and the room or the reason it is refused */
  const show = (lon: number, lat: number) => {
    const found = read(lon, lat)
    if (!found) return
    const { view, pointer, line } = found
    lastLine = line
    roomActions().show(previewOf(pointer, line, view.unproject, [lon, lat]))
  }

  const previewOf = (
    pointer: DraftPointer,
    line: Loc[] | undefined,
    unproject: (p: Pt) => Loc,
    at: Loc,
  ): RoomPreview => {
    if (pointer.kind === 'off-wall')
      return { labels: [{ at, text: m.room_click_wall({ ...device() }) }] }
    if (pointer.kind === 'start') return { wallPoint: unproject(pointer.at) }
    const next = unproject(pointer.kind === 'end' ? pointer.at : pointer.next)
    const drawn = [...points, next]
    const preview: RoomPreview = { line: drawn }
    const last = points[points.length - 1]!
    const labels: { at: Loc; text: string; refused?: boolean }[] = [
      { at: middle(last, next), text: lengthOf(last, next) },
    ]
    if (pointer.kind === 'end') preview.wallPoint = next
    if (pointer.kind === 'corner') {
      const guides: Loc[][] = []
      if (pointer.guide) guides.push([next, unproject(pointer.guide)])
      if (pointer.closure) guides.push([next, unproject(pointer.closure)])
      preview.guides = guides
    }
    if (line) {
      const plan = splitOffPreview(editor.history.staging.graph, wayId, line)
      if ('refused' in plan) labels.push({ at, text: refusalText(plan.refused), refused: true })
      else preview.room = plan.ring
    }
    preview.labels = labels
    return preview
  }

  /** Writes the room along the line as one undo step and ends the mode with the room selected; a refusal is shown */
  const commit = (line: Loc[], at: Loc) => {
    const tags = { ...ROOM_TAGS, ...engine.levelTags() }
    const plan = splitOffPlan(editor.history.staging.graph, wayId, line, tags)
    if ('refused' in plan) {
      roomActions().show({ line, labels: [{ at, text: refusalText(plan.refused), refused: true }] })
      return
    }
    engine.change(() => {
      editor.history.perform(plan.action)
      editor.history.commit({ annotation: m.room_annotation(), selectedIDs: [plan.roomId] })
    })
    engine.exitModuleMode(ROOM_ID)
    // the room is selected, as after a drawing; it has its type already, so the inspector shows its fields
    engine.announceDrawn(plan.roomId)
  }

  return {
    id: ROOM_ID,
    cursor: 'crosshair',
    // the points are not in the history until the room is written: undo only ends the mode
    endsOnUndo: true,
    onMove: (lon, lat) => show(lon, lat),
    onClick: (lon, lat) => {
      const found = read(lon, lat)
      if (!found) return
      const { view, pointer, line } = found
      if (pointer.kind === 'off-wall') return
      if (pointer.kind === 'start') {
        points = [view.unproject(pointer.at)]
        startEdge = pointer.edge
      } else if (pointer.kind === 'end') {
        if (line) commit(line, [lon, lat])
        return
      } else {
        // a click on the last corner again ends the room as the preview shows it
        const last = view.draft.points[view.draft.points.length - 1]
        if (last && distance(last, pointer.next) <= SNAP_PX) {
          if (lastLine) commit(lastLine, [lon, lat])
          return
        }
        points = [...points, view.unproject(pointer.next)]
      }
      show(lon, lat)
    },
    onKey: (key) => {
      if (key === 'Enter') {
        if (lastLine) commit(lastLine, lastLine[lastLine.length - 1]!)
        return true
      }
      // Backspace takes the last point back; it is the mode's even without points, so the building is not deleted
      points = points.slice(0, -1)
      lastLine = undefined
      roomActions().show({})
      return true
    },
    onExit: () => {
      points = []
      lastLine = undefined
      roomActions().clear()
    },
  }
}
