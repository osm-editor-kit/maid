/**
 * The quick-tag buttons of a selected road: the 33 buttons of the Berlin parking project's hot-button file
 * (the mapping project's JOSM file street_parking_hot_buttons.xml, group "Street Parking Hot Buttons"), Maid's
 * no-parking-with-reason values, the lane-parallel toggles and the clearing buttons (qa-markings-obstacles-process.md, 5.2).
 * Pure data: the logic is in quick-tag-logic.ts, the component in QuickTags.tsx. No icon imports here.
 * Names are messages (../messages.ts), read when a button is shown: they follow the page's language.
 *
 * The grid has one row per group (`QUICK_TAG_ROWS`). Within a row, the buttons of one side are the values of one
 * cell, in the order a click goes through them: position `no`, `lane`, `separate`; then the cell is unset.
 */
import { m } from '../messages.ts'
import { sideKey, type Side, type TagEdit } from '../sides.ts'

/** A button: one value of a cell (or a toggle, or a clearing button): what it sets on the selected road(s). */
export type QuickTag = {
  /** Unique, stable id of the button. The 33 source buttons use the source's `name` (their icon has the same name). */
  id: string
  /** The name in the page's language, with the side: the undo step and the tooltip of a toggle */
  readonly label: string
  /** The name of the value alone, without the side ("With fee"): what a cycling cell says it is set to */
  readonly name: string
  /** The name of an icon in `PARKING_ICONS` (../icons) */
  icon?: string
  /** The side of the road the button is about: its column in the grid, and the side the map shows while it has the focus */
  side: Side
  /** The grid row this button is in (`QUICK_TAG_ROWS`); the buttons of one row and side form one cell */
  row: QuickTagGroup
  /** The tags it sets, one edit per key */
  edits: TagEdit[]
  /** Removes every parking value of this side (`both`: of both sides) instead of setting `edits` */
  clearSide?: Side
  /** `xml`: one of the 33 source buttons. `maid`: Maid's addition, see `origin` */
  source: 'xml' | 'maid'
  /** For a Maid addition: the entry of the documents it comes from, or why it has none */
  origin?: string
}

/**
 * The groups of the grid, in the order of the source file, then Maid's own. Each group is a row. The values of a
 * cycling group exclude each other; `lane` is a toggle; `clear` removes the parking tags of a side.
 */
export type QuickTagGroup =
  | 'position'
  | 'orientation'
  | 'restriction'
  | 'fee'
  | 'markings'
  | 'reason'
  | 'lane'
  | 'clear'

/** A row of the grid: its heading (the first column), and whether a click on its cells goes through values */
export type QuickTagRow = {
  id: QuickTagGroup
  readonly label: string
  /** True: the cells cycle through their values (the cell says the next one). False: a toggle, or a clearing row. */
  cycles: boolean
}

type Topic = {
  /** The part of the source's `name` after the side: `parking_left_<name>` */
  name: string
  /** The key after `parking:<side>`: `orientation` for `parking:left:orientation`, undefined for `parking:left` */
  suffix?: string
  value: string
  group: QuickTagGroup
  label: () => string
}

/** The 11 topics of the source file, each for the three sides (33 buttons), in the file's order */
const SOURCE_TOPICS: readonly Topic[] = [
  { name: 'no', value: 'no', group: 'position', label: () => m.quick_topic_no() },
  {
    name: 'lane',
    value: 'lane',
    group: 'position',
    label: () => m.quick_topic_lane(),
  },
  {
    name: 'separate',
    value: 'separate',
    group: 'position',
    label: () => m.quick_topic_separate(),
  },
  {
    name: 'orientation_parallel',
    suffix: 'orientation',
    value: 'parallel',
    group: 'orientation',
    label: () => m.quick_topic_parallel(),
  },
  {
    name: 'orientation_diagonal',
    suffix: 'orientation',
    value: 'diagonal',
    group: 'orientation',
    label: () => m.quick_topic_diagonal(),
  },
  {
    name: 'orientation_perpendicular',
    suffix: 'orientation',
    value: 'perpendicular',
    group: 'orientation',
    label: () => m.quick_topic_perpendicular(),
  },
  {
    name: 'restriction_no_stopping',
    suffix: 'restriction',
    value: 'no_stopping',
    group: 'restriction',
    label: () => m.quick_topic_no_stopping(),
  },
  {
    name: 'restriction_no_parking',
    suffix: 'restriction',
    value: 'no_parking',
    group: 'restriction',
    label: () => m.quick_topic_no_parking(),
  },
  {
    name: 'fee_yes',
    suffix: 'fee',
    value: 'yes',
    group: 'fee',
    label: () => m.quick_topic_fee_yes(),
  },
  {
    name: 'fee_no',
    suffix: 'fee',
    value: 'no',
    group: 'fee',
    label: () => m.quick_topic_fee_no(),
  },
  {
    name: 'markings_yes',
    suffix: 'markings',
    value: 'yes',
    group: 'markings',
    label: () => m.quick_topic_markings_yes(),
  },
]

const SIDES: readonly Side[] = ['left', 'right', 'both']

/** The name of a side in the page's language */
export function sideNameOf(side: Side): string {
  return side === 'left'
    ? m.quick_side_left()
    : side === 'right'
      ? m.quick_side_right()
      : m.quick_side_both()
}

/** The 33 source buttons, in the file's order: by topic, then left, right, both */
const SOURCE_BUTTONS: QuickTag[] = SOURCE_TOPICS.flatMap((topic) =>
  SIDES.map(
    (side): QuickTag => ({
      id: `parking_${side}_${topic.name}`,
      get label() {
        return m.quick_side_label({ topic: topic.label(), side: sideNameOf(side) })
      },
      get name() {
        return topic.label()
      },
      icon: `parking_${side}_${topic.name}`,
      side,
      row: topic.group,
      edits: [{ key: sideKey(side, topic.suffix), value: topic.value }],
      source: 'xml',
    }),
  ),
)

/** The reasons of "no parking" (qa-markings-obstacles-process.md, 5.1: `parking:<side>:reason`), in the cycle's order */
const REASONS = [
  { value: 'construction', label: () => m.quick_reason_construction() },
  { value: 'structure', label: () => m.quick_reason_structure() },
  { value: 'dual_carriage', label: () => m.quick_reason_dual_carriage() },
] as const

const REASON_ORIGIN =
  "Maid's addition from qa-markings-obstacles-process.md, 5.2 'No parking, with reason' (O3, S5, S15)"

/** Maid's additions in the grid: no parking on a side with a reason; the reasons are the values of one cell */
const REASON_BUTTONS: QuickTag[] = REASONS.flatMap((reason) =>
  SIDES.map(
    (side): QuickTag => ({
      id: `maid_${side}_no_reason_${reason.value}`,
      get label() {
        return m.quick_no_reason_button({ side: sideNameOf(side), reason: reason.label() })
      },
      get name() {
        return m.quick_no_reason_row({ reason: reason.label() })
      },
      icon: `parking_${side}_no`,
      side,
      row: 'reason',
      edits: [
        { key: sideKey(side), value: 'no' },
        { key: sideKey(side, 'reason'), value: reason.value },
      ],
      source: 'maid',
      origin: REASON_ORIGIN,
    }),
  ),
)

/** The lane-parallel toggles: parking on the carriageway, parallel, on one side or (`both`) on both */
const LANE_BUTTONS: QuickTag[] = [
  {
    id: 'maid_both_lane_parallel',
    get label() {
      return m.quick_lane_both_parallel()
    },
    get name() {
      return m.quick_lane_both_parallel()
    },
    icon: 'parking_both_lane',
    side: 'both',
    row: 'lane',
    edits: [
      { key: 'parking:left', value: 'lane' },
      { key: 'parking:left:orientation', value: 'parallel' },
      { key: 'parking:right', value: 'lane' },
      { key: 'parking:right:orientation', value: 'parallel' },
    ],
    source: 'maid',
    origin:
      "Maid's addition from qa-markings-obstacles-process.md, 5.2 'Lane parking, both sides, parallel' (S9). Equal sides are written as `parking:both`, as the fields do.",
  },
  ...(['left', 'right'] as const).map(
    (side): QuickTag => ({
      id: `maid_${side}_lane_parallel`,
      get label() {
        return m.quick_lane_side_parallel({ side: sideNameOf(side) })
      },
      get name() {
        return m.quick_lane_side_parallel({ side: sideNameOf(side) })
      },
      icon: `parking_${side}_lane`,
      side,
      row: 'lane',
      edits: [
        { key: sideKey(side), value: 'lane' },
        { key: sideKey(side, 'orientation'), value: 'parallel' },
      ],
      source: 'maid',
      origin:
        "Maid's addition from qa-markings-obstacles-process.md, 5.2 'Lane parking, one side, parallel' (S1: offer it when the carriageway is 5 to 7 m wide)",
    }),
  ),
]

/** The clearing buttons: every parking key of the left side, of the right side, of both sides */
const CLEAR_BUTTONS: QuickTag[] = SIDES.map((side): QuickTag => {
  const text = (): string =>
    side === 'left'
      ? m.quick_clear_left()
      : side === 'right'
        ? m.quick_clear_right()
        : m.quick_clear_both()
  return {
    id: `maid_clear_${side}`,
    get label() {
      return text()
    },
    get name() {
      return text()
    },
    side,
    row: 'clear',
    clearSide: side,
    edits: [],
    source: 'maid',
    origin:
      side === 'both'
        ? "Maid's addition: removes every parking key of both sides. No entry of the documents."
        : "Maid's addition: removes every parking key of the side; the other side keeps what it had. No entry of the documents.",
  }
})

/** The grid's rows, top to bottom. The buttons of a row and side are its cell (`QuickTag.row`). */
export const QUICK_TAG_ROWS: readonly QuickTagRow[] = [
  {
    id: 'position',
    cycles: true,
    get label() {
      return m.quick_heading_position()
    },
  },
  {
    id: 'orientation',
    cycles: true,
    get label() {
      return m.quick_heading_orientation()
    },
  },
  {
    id: 'restriction',
    cycles: true,
    get label() {
      return m.quick_heading_restriction()
    },
  },
  {
    id: 'fee',
    cycles: true,
    get label() {
      return m.quick_heading_fee()
    },
  },
  {
    id: 'markings',
    cycles: true,
    get label() {
      return m.quick_heading_markings()
    },
  },
  {
    id: 'reason',
    cycles: true,
    get label() {
      return m.quick_heading_reason()
    },
  },
  {
    id: 'lane',
    cycles: false,
    get label() {
      return m.quick_heading_lane()
    },
  },
  {
    id: 'clear',
    cycles: false,
    get label() {
      return m.quick_heading_clear()
    },
  },
]

/** All buttons: the 33 source buttons, Maid's no-parking-with-reason values, the lane toggles, the clearing buttons */
export const QUICK_TAGS: QuickTag[] = [
  ...SOURCE_BUTTONS,
  ...REASON_BUTTONS,
  ...LANE_BUTTONS,
  ...CLEAR_BUTTONS,
]
