/**
 * The quick-tag buttons of a selected road: the 33 buttons of the Berlin parking project's hot-button file
 * (the mapping project's JOSM file street_parking_hot_buttons.xml, group "Street Parking Hot Buttons"), and
 * Maid's additions for the combined buttons the documents ask for (qa-markings-obstacles-process.md, 5.2).
 * Pure data: the logic is in quick-tag-logic.ts, the component in QuickTags.tsx. No icon imports here.
 * Names are messages (../messages.ts), read when a button is shown: they follow the page's language.
 */
import { m } from '../messages.ts'
import { sideKey, type RealSide, type Side, type TagEdit } from '../sides.ts'

/** A button: what it sets on the selected road(s). `edits` are the tags as the source has them (`value` undefined removes a key). */
export type QuickTag = {
  /** Unique, stable id of the button. The 33 source buttons use the source's `name` (their icon has the same name). */
  id: string
  /** The name in the page's language: shown in the tooltip and read by screen readers */
  readonly label: string
  /** The name of an icon in `PARKING_ICONS` (../icons) */
  icon?: string
  /** The side of the road the button is about: its column in the grid, and the side the map shows while it has the focus */
  side: Side
  /** The grid row of a single-side button (`QUICK_TAG_ROWS`). Absent for the combined buttons, which are listed below the grid. */
  row?: string
  /** The tags it sets, one edit per key */
  edits: TagEdit[]
  /** Removes every parking value of this side instead of setting `edits`; the other side keeps what it reads */
  clearSide?: RealSide
  /** `xml`: one of the 33 source buttons. `maid`: Maid's addition, see `origin` */
  source: 'xml' | 'maid'
  /** For a Maid addition: the entry of the documents it comes from, or why it has none */
  origin?: string
}

/** The groups of the grid, in the order of the source file, then Maid's own */
export type QuickTagGroup =
  | 'position'
  | 'orientation'
  | 'restriction'
  | 'fee'
  | 'markings'
  | 'reason'

/** A row of the grid: its name, and the buttons of its three columns are the ones with `row === id` */
export type QuickTagRow = {
  id: string
  group: QuickTagGroup
  readonly label: string
}

type Topic = {
  /** The part of the source's `name` after the side: `parking_left_<name>` */
  name: string
  /** The key after `parking:<side>`: `orientation` for `parking:left:orientation`, '' for `parking:left` */
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

const SIDE_NAMES: Record<Side, () => string> = {
  left: () => m.quick_side_left(),
  right: () => m.quick_side_right(),
  both: () => m.quick_side_both(),
}

/** The 33 source buttons, in the file's order: by topic, then left, right, both */
const SOURCE_BUTTONS: QuickTag[] = SOURCE_TOPICS.flatMap((topic) =>
  (['left', 'right', 'both'] as const).map(
    (side): QuickTag => ({
      id: `parking_${side}_${topic.name}`,
      get label() {
        return m.quick_side_label({ topic: topic.label(), side: SIDE_NAMES[side]() })
      },
      icon: `parking_${side}_${topic.name}`,
      side,
      row: topic.name,
      edits: [{ key: sideKey(side, topic.suffix), value: topic.value }],
      source: 'xml',
    }),
  ),
)

/** The reasons of "no parking" (qa-markings-obstacles-process.md, 5.1: `parking:<side>:reason`) */
const REASONS = [
  { value: 'construction', label: () => m.quick_reason_construction() },
  { value: 'structure', label: () => m.quick_reason_structure() },
  { value: 'dual_carriage', label: () => m.quick_reason_dual_carriage() },
] as const

const REASON_ORIGIN =
  "Maid's addition from qa-markings-obstacles-process.md, 5.2 'No parking, with reason' (O3, S5, S15)"

/** Maid's additions in the grid: no parking on a side with a reason, one row per reason */
const REASON_BUTTONS: QuickTag[] = REASONS.flatMap((reason) =>
  (['left', 'right', 'both'] as const).map(
    (side): QuickTag => ({
      id: `maid_${side}_no_reason_${reason.value}`,
      get label() {
        return m.quick_no_reason_button({
          side: SIDE_NAMES[side](),
          reason: reason.label(),
        })
      },
      icon: `parking_${side}_no`,
      side,
      row: `reason-${reason.value}`,
      edits: [
        { key: sideKey(side), value: 'no' },
        { key: sideKey(side, 'reason'), value: reason.value },
      ],
      source: 'maid',
      origin: REASON_ORIGIN,
    }),
  ),
)

/** The grid's rows: the source's topics, then the reasons */
export const QUICK_TAG_ROWS: readonly QuickTagRow[] = [
  ...SOURCE_TOPICS.map((topic) => ({
    id: topic.name,
    group: topic.group,
    get label() {
      return topic.label()
    },
  })),
  ...REASONS.map((reason) => ({
    id: `reason-${reason.value}`,
    group: 'reason' as const,
    get label() {
      return m.quick_no_reason_row({ reason: reason.label() })
    },
  })),
]

/** Maid's combined buttons: each sets several tags in one click. They are listed below the grid. */
const COMBINED_BUTTONS: QuickTag[] = [
  {
    id: 'maid_both_lane_parallel',
    get label() {
      return m.quick_lane_both_parallel()
    },
    icon: 'parking_both_lane',
    side: 'both',
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
        return m.quick_lane_side_parallel({ side: SIDE_NAMES[side]() })
      },
      icon: `parking_${side}_lane`,
      side,
      edits: [
        { key: sideKey(side), value: 'lane' },
        { key: sideKey(side, 'orientation'), value: 'parallel' },
      ],
      source: 'maid',
      origin:
        "Maid's addition from qa-markings-obstacles-process.md, 5.2 'Lane parking, one side, parallel' (S1: offer it when the carriageway is 5 to 7 m wide)",
    }),
  ),
  ...(['left', 'right'] as const).map(
    (side): QuickTag => ({
      id: `maid_clear_${side}`,
      get label() {
        return side === 'left' ? m.quick_clear_left() : m.quick_clear_right()
      },
      side,
      clearSide: side,
      edits: [],
      source: 'maid',
      origin:
        "Maid's addition: removes every parking key of the side; the other side keeps what it had. No entry of the documents.",
    }),
  ),
]

/** The buttons, in the order shown: the 33 source buttons, Maid's no-parking-with-reason rows, then the combined ones */
export const QUICK_TAGS: QuickTag[] = [...SOURCE_BUTTONS, ...REASON_BUTTONS, ...COMBINED_BUTTONS]
