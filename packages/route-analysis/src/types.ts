// The contract of the route analysis. Plain data only (strings, numbers, arrays, maps), no model classes, so that the
// analysis can move into a web worker without changes (docs/research/relation-overview.md).

/** Member types as the relation holds them */
export type MemberType = 'node' | 'way' | 'relation'

/** A member of the relation, in relation order. `id` is Maid's entity id: `n1`, `w2`, `r3`. */
export type RouteMember = { type: MemberType; id: string; role: string }

/** Longitude, latitude */
export type LonLat = readonly [number, number]

/** Everything the analysis reads. Members that are not in `ways` or `nodes` count as not loaded. */
export type RouteInput = {
  /** The relation's tags (`type`, `route`, `name` ...) */
  tags: Readonly<Record<string, string>>
  members: readonly RouteMember[]
  /** The node ids of each loaded way, in drawing order */
  ways: ReadonlyMap<string, readonly string[]>
  /** The position of each loaded node */
  nodes: ReadonlyMap<string, LonLat>
  /** Tags of loaded members, by entity id. Used for point kinds (a guidepost without the role) and labels. */
  memberTags?: ReadonlyMap<string, Readonly<Record<string, string>>>
  /**
   * For junctions: how many loaded ways that are NOT members of this relation use each node. Only nodes of member
   * ways matter. Missing: no junctions are found (the panel says the network is not known).
   */
  outsideWays?: ReadonlyMap<string, number>
}

/**
 * What a member is to the overview. Every member gets exactly one kind; `other` is the fallback that is still listed
 * with its type and role.
 * - `main`: a way of the main line (empty role, `main`, `forward`, `backward`, `hail_and_ride`, `reverse` ...)
 * - `branch`: a way of a side line (`alternative`, `excursion`, `approach`, `connection`)
 * - `stop`, `platform`: public transport members (also the `_entry_only` and `_exit_only` variants)
 * - `point`: any other node (guidepost, milestone, information, station, start ... or no role)
 * - `subroute`: a relation member
 * - `unloaded`: not in the input data
 * - `other`: a loaded way with a role the overview does not know
 */
export type MemberKind =
  | 'main'
  | 'branch'
  | 'stop'
  | 'platform'
  | 'point'
  | 'subroute'
  | 'unloaded'
  | 'other'

export type MemberInfo = {
  /** Position in `RouteInput.members` */
  index: number
  member: RouteMember
  kind: MemberKind
  /** False when the role is not in the known role list: shown with a hint, never dropped */
  knownRole: boolean
  /** For `point` members: what kind of point (from the role, else from the tags) */
  pointKind?: PointKind
}

export type PointKind =
  | 'guidepost'
  | 'milestone'
  | 'information'
  | 'station'
  | 'start'
  | 'end'
  | 'other'

/** One way of a piece, oriented in travel order */
export type ChainStep = {
  /** Member index of the way */
  index: number
  wayId: string
  /** True when the route runs against the way's drawing direction */
  reversed: boolean
  /** Node where the route enters and leaves this way */
  from: string
  to: string
  /** Metres along the way between `from` and `to` */
  length: number
  /** Metres from the start of the whole line to `from` (gaps count as zero) */
  at: number
}

/** Ways that join end to end, without a gap */
export type Piece = {
  steps: ChainStep[]
  /** Metres from the start of the whole line */
  at: number
  length: number
  /**
   * Member indexes of `forward`/`backward` ways that run beside this piece as the other strand of a one-way section
   * (they share a node with the piece but do not continue it). They add no length and do not break the piece.
   */
  parallel: number[]
}

/**
 * Waymarked Trails' terms: `yes` the main ways join in relation order; `sorted` they join into one line only in
 * another order (the overview shows that order, and reports it); `no` gaps remain (relation order is kept).
 * `empty`: no loaded main way.
 */
export type Linear = 'yes' | 'sorted' | 'no' | 'empty'

/** A break between two consecutive pieces of the line */
export type Gap = {
  /** Index into `pieces` of the piece before the gap */
  after: number
  /** Last node of the piece before, first node of the piece after */
  from: string
  to: string
  /** Straight-line metres between them */
  distance: number
  /** Metres along the line where the gap is */
  at: number
}

export type Chain = {
  /** The pieces in the order the overview shows them */
  pieces: Piece[]
  linear: Linear
  gaps: Gap[]
  /** Total metres of the line (pieces only) */
  length: number
  /**
   * For `sorted`: the member indexes of the main ways in the order of the line, to compare with relation order.
   * Empty otherwise.
   */
  sortedOrder: number[]
}

/** A node, stop or platform placed on the line */
export type PlacedPoint = {
  index: number
  /** Metres along the line of the nearest point on it; undefined when the member or the line is not loaded */
  at?: number
  /** Metres from the line */
  offset?: number
  /** Index into `pieces` */
  piece?: number
  /** Where it is: the node, or the centre of a platform way */
  loc?: LonLat
  /** Stops and platforms only: its place on the line goes backwards against relation order */
  outOfSequence: boolean
}

/** A side line (alternative, excursion, approach, connection) beside the main line */
export type Branch = {
  role: string
  /** Member indexes of its ways, in travel order */
  indexes: number[]
  /** Metres along the main line where it leaves and where it rejoins; undefined when it does not touch the main line */
  from?: number
  to?: number
  length: number
}

/** A node of the main line where other ways (not members) meet it */
export type Junction = {
  node: string
  at: number
  /** Number of ways that are not members and use this node */
  outside: number
  /** Member index of the nearest guidepost within the radius, if any */
  guidepost?: number
}

export type IssueCode =
  /** The line breaks: two pieces do not meet */
  | 'gap'
  /** The ways join into one line only in another order than the relation lists them */
  | 'order'
  /** Members that are not loaded: the overview cannot place them */
  | 'not-loaded'
  /** A point member is far from the line */
  | 'point-far'
  /** A stop or platform comes earlier on the line than the one listed before it */
  | 'out-of-sequence'
  /** Other ways meet the route here and no guidepost member is near */
  | 'junction-without-guidepost'
  /** A hiking or bicycle route that lists no guidepost at all: junction hints are off */
  | 'no-guideposts'
  /** A role the overview does not know */
  | 'unknown-role'
  /** A side line that touches the main line nowhere */
  | 'branch-detached'
  /** The same member with the same role twice in a row */
  | 'duplicate'
  /** No loaded main way */
  | 'empty'

export type RouteIssue = {
  code: IssueCode
  severity: 'warning' | 'info'
  /** Member indexes involved */
  members: number[]
  /** Metres along the line, for placing the (i) next to it */
  at?: number
  loc?: LonLat
  /** Numbers for the message, e.g. `{ distance: 120 }` */
  detail?: Readonly<Record<string, number | string>>
}

export type AnalysisOptions = {
  /** A point further than this many metres from the line is `point-far` (default 30) */
  pointRadius?: number
  /** A junction with no guidepost within this many metres gets a hint (default 50) */
  guidepostRadius?: number
}

export type RouteAnalysis = {
  members: MemberInfo[]
  chain: Chain
  points: PlacedPoint[]
  branches: Branch[]
  junctions: Junction[]
  issues: RouteIssue[]
}

/** The overview's two spacings: every section the same height, or heights by length */
export type OverviewMode = 'schematic' | 'scaled'

export type OverviewRowKind =
  | 'start'
  | 'end'
  | 'point'
  | 'stop'
  | 'platform'
  | 'junction'
  | 'gap'
  | 'branch-start'
  | 'branch-end'
  /** Members the line cannot place (not loaded, sub-relations, unknown roles, points without a position), grouped */
  | 'unplaced'

/** One line of the overview, top to bottom in travel order; unplaced rows come last */
export type OverviewRow = {
  key: string
  kind: OverviewRowKind
  /** Member indexes this row stands for (a point, the two sides of a gap, the ways of a branch, a group) */
  members: number[]
  /** Metres along the line; undefined for unplaced rows */
  at?: number
  /** Indexes into `RouteAnalysis.issues` shown on this row as (i) buttons */
  issues: number[]
  /** 0 is the main line; branch rows sit on lane 1, 2 ... */
  lane: number
  /** For branch rows: index into `RouteAnalysis.branches` */
  branch?: number
  /** Top of the row, in px */
  y: number
}

/** The drawn line between two rows */
export type OverviewSection = {
  /** Indexes into `rows` */
  fromRow: number
  toRow: number
  /** Metres */
  length: number
  /** Member indexes of the main ways in this stretch */
  members: number[]
  lane: number
  /** True when this stretch is a gap (drawn broken) */
  gap: boolean
  y: number
  height: number
}

/** A branch drawn as a lane beside the main line */
export type OverviewLane = {
  lane: number
  /** Index into `RouteAnalysis.branches` */
  branch: number
  fromY: number
  toY: number
}

export type OverviewLayout = {
  rows: OverviewRow[]
  sections: OverviewSection[]
  lanes: OverviewLane[]
  /** Total height in px */
  height: number
}

export type LayoutOptions = {
  /** Height of a row in px (default 28) */
  rowHeight?: number
  /** Schematic: height of every section in px (default 12) */
  sectionHeight?: number
  /** Scaled: px per kilometre (default 40) */
  pxPerKm?: number
  /** Scaled: the smallest section height in px (default 4) */
  minSectionHeight?: number
}
