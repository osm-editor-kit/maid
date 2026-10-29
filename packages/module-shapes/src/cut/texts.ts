/**
 * The sentences the cut shows: why it is refused, and what to do in the mode. Each text is read when it is shown, in
 * the language of the moment (see messages.ts).
 */
import { device } from '@osm-editor-kit/maid-i18n'
import { m } from '../messages.ts'
import { sentenceOf } from '../shared/refusals.ts'
import type { CutRefusal } from './cut.ts'

/** The sentence for a refusal */
export const refusalText = sentenceOf<CutRefusal>({
  not_area: () => m.cut_refusal_not_area(),
  crossings: () => m.cut_refusal_crossings(),
  tangent: () => m.cut_refusal_tangent(),
  along_edge: () => m.cut_refusal_along_edge(),
  shared_edge: () => m.cut_refusal_shared_edge(),
  relation_member: () => m.cut_refusal_relation_member(),
  roundabout: () => m.cut_refusal_roundabout(),
  multi_way_outline: () => m.cut_refusal_multi_way_outline(),
  several_outlines: () => m.cut_refusal_several_outlines(),
  through_hole: () => m.cut_refusal_through_hole(),
  self_intersecting: () => m.cut_refusal_self_intersecting(),
  degenerate: () => m.cut_refusal_degenerate(),
  too_many_nodes: () => m.cut_refusal_too_many_nodes(),
})

/**
 * What the mode says while nothing is refused: how to finish and how to leave.
 * @return  The text, in the language of the moment
 */
export function hintText(): string {
  return m.cut_hint({ ...device() })
}
