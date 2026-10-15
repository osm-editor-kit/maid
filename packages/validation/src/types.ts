import type { Action, DifferenceChange, Graph, OsmEntity, OsmWay } from '@osm-editor-kit/maid-model'

export type Severity = 'error' | 'warning'

/** Something a person can do about an issue, as actions that become one undo step */
export type Fix = {
  id: string
  /** For a button, e.g. "Connect the features" */
  label: string
  /** Name of the undo step, e.g. "Connected two crossing features" */
  annotation: string
  /** The actions, worked out when the fix is chosen, on the graph as it is then */
  actions(graph: Graph): Action[]
}

/** One thing a rule found */
export type Issue = {
  /** Stable for the same finding on the same entities, so a list can keep its place: `rule:ids…` */
  id: string
  rule: string
  severity: Severity
  /** One sentence, e.g. "Hauptstraße crosses Nebenweg without a junction" */
  message: string
  /** The entities it is about. The first one is the one the issue is listed under. */
  entityIds: string[]
  /** Where to look, if the issue has a place: [lon, lat] */
  loc?: [number, number]
  /** Ways out, best first. Can be empty: then the person has to change the data by hand. */
  fixes: Fix[]
  /** What the rule measured, for the tests and for fixes, e.g. `connectionTags` of a crossing */
  data?: Readonly<Record<string, unknown>>
}

/**
 * The part of the presets (maid-presets' `Presets`) that rules use. Structural, so that this package does not depend on
 * the presets package: `Presets` has all of it. Method syntax on purpose: a `geometry` of `string` takes `Geometry`.
 */
export type PresetLookup = {
  match(
    tags: Readonly<Record<string, string>>,
    geometry: string,
    loc?: readonly [number, number],
  ): LookupPreset
  preset(id: string): LookupPreset | undefined
  applyPreset(
    tags: Readonly<Record<string, string>>,
    preset: LookupPreset,
    geometry: string,
    previous?: LookupPreset,
    options?: { skipFieldDefaults?: boolean },
  ): Record<string, string>
  deprecatedTags(
    tags: Readonly<Record<string, string>>,
  ): { old: Record<string, string>; replace?: Record<string, string> }[]
  /**
   * iD's utilGetRelationSchema: the roles of a relation with these tags, with their labels (`label` is '' when there
   * is none). {} when the relation's preset has no member schema (id-tagging-schema 7.3.0 has none for routes yet).
   */
  relationRoles(tags: Readonly<Record<string, string>>): RelationRoles
  /** iD's utilRelationAllowsDuplicateMembers: false only when the relation's schema says `allowDuplicateMembers: false`. */
  allowsDuplicateMembers(tags: Readonly<Record<string, string>>): boolean
  /** The relation's roles that a member with this geometry and these tags fits (the presets filter them) */
  memberRoles(
    relationTags: Readonly<Record<string, string>>,
    geometry: string | undefined,
    memberTags: Readonly<Record<string, string>> | undefined,
  ): RelationRoles
}

/** One member rule of a relation's schema (id-tagging-schema `relation.members[]`): the role, and what a member needs for it */
export type RelationMemberRule = {
  role: string
  /** The geometries a member may have for this role. Absent: any. */
  geometry?: readonly string[]
  /** Tag patterns (iD's osmMatchTags) a member must match for this role. Absent: any tags. */
  matchTags?: readonly Readonly<Record<string, string>>[]
  min?: number
  max?: number
}

/** The roles of a relation: role → its label ('' when there is none) and its member rule */
export type RelationRoles = Record<string, { label: string; member: RelationMemberRule }>

/** The fields of a preset that the rules read. `addTags` is `tags` itself when the preset has none (as in maid-presets). */
export type LookupPreset = {
  id: string
  tags: Readonly<Record<string, string>>
  addTags: Readonly<Record<string, string>>
  replacement?: string
}

/** What a rule may look at besides the entity */
export type RuleContext = {
  graph: Graph
  /**
   * The presets of the editor, as they are at this run. Undefined until they are made (the presets of a large
   * schema are made after the first picture): a rule that needs them reports nothing then, and the validator is
   * run again over what was changed when they are there (see `ValidatorOptions`).
   */
  presets?: PresetLookup
  /** Ways whose bounding box overlaps the one of this way, without the way itself */
  waysNear(way: OsmWay): OsmWay[]
  /**
   * The ids this run validates, which is what was changed. A rule about groups needs it: a road
   * that reaches a road nobody changed is connected to the network.
   */
  validated: ReadonlySet<string>
  /**
   * Kept for one run only, for what a rule computes about the graph and that other entities of the
   * run need too (e.g. the island of a road). A rule keys its entries with its own id.
   */
  memo: Map<string, unknown>
}

/** A check that looks at one entity and reports what is wrong with it */
export type Rule = {
  id: string
  /** For a list of rules, e.g. "Crossing ways" */
  label: string
  validate(entity: OsmEntity, context: RuleContext): Issue[]
}

/** A difference between two graphs, as the history gives it: what changed, and both graphs to look up neighbours in */
export type GraphChange = {
  base: Graph
  head: Graph
  /** Every entity that differs, from the base to the head, with its base and head versions */
  changes: ReadonlyMap<string, DifferenceChange>
}

/**
 * Runs rules over entities and keeps what they found. It validates what it is told to, which
 * is what a person changed: checking everything that was loaded would report other people's
 * old mistakes.
 */
export type Validator = {
  readonly rules: readonly Rule[]
  /**
   * Validates these entities against the graph and replaces the issues they had. An id that is
   * no longer in the graph loses its issues. `ways` are all ways that neighbour rules may
   * compare with (the caller knows what is loaded).
   */
  validate(graph: Graph, entityIds: Iterable<string>, ways: Iterable<OsmWay>): void
  /**
   * Checks what the difference makes necessary to check again (`entitiesToValidate`), replaces the
   * issues about those entities and drops the issues that name no changed entity. Give the whole
   * difference from the base as `change`: a deletion makes its neighbours checked again, and what is
   * no longer changed is no longer reported.
   *
   * `step` is what this commit changed, from the graph of the previous update to `change.head` (an
   * edit, an undo or a redo). With it only the step's entities and their neighbours are checked
   * again, so the cost of a commit does not grow with the session; the whole difference still decides
   * what is kept. Without it, everything `change` names is checked again.
   */
  update(
    change: GraphChange,
    ways: Iterable<OsmWay>,
    step?: ReadonlyMap<string, DifferenceChange>,
  ): void
  /** Drops every issue whose first entity is not in `entityIds`: what is no longer changed is no longer reported */
  keepOnly(entityIds: Iterable<string>): void
  /**
   * Checks these entities on demand, as the features the person looks at (`neighbourhoodOf`): the rules run
   * over them against `graph` (the loaded data, with the edits), and what they find is kept as existing data.
   * An issue that names an entity the edits changed is the edits' instead. It replaces the existing issues of
   * the last check. Nothing is fetched: only what `graph` holds is checked.
   */
  checkExisting(graph: Graph, entityIds: Iterable<string>, ways: Iterable<OsmWay>): void
  /**
   * Forgets what was computed from the graph (the boxes of the ways), and the existing issues. Call it when
   * the base data changed other than by edits, e.g. after a merge: the next update makes the boxes again.
   */
  reset(): void
  /**
   * All issues that are shown, errors first, then by rule and id: the edits' issues, and the existing ones when
   * `ValidatorOptions.showExisting` says so. Issues the person ignores are left out.
   */
  issues(): readonly Issue[]
  /**
   * The warnings the person ignores that are still found (of the edits, and of the existing data when it is shown):
   * the count of "N ignored" and the list to show again
   */
  ignoredIssues(): readonly Issue[]
  /** The existing issues that are found, whatever is shown: errors first. Ignored ones are left out. */
  existingIssues(): readonly Issue[]
  /** The existing issues of one entity, whatever is shown: the quiet line of an inspector. Ignored ones are left out. */
  existingIssuesFor(entityId: string): readonly Issue[]
  /** The issues an entity is part of, as shown (see `issues`) */
  issuesFor(entityId: string): readonly Issue[]
  /**
   * The issues that involve any of several features, in iD's order for a selection (`sharedIssues`):
   * what the inspector of several features shows.
   */
  issuesForAll(entityIds: readonly string[]): readonly Issue[]
}
