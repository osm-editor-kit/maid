import type { Action, Graph, OsmEntity, OsmWay } from '@osm-editor-kit/maid-model'

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
}

/** What a rule may look at besides the entity */
export type RuleContext = {
  graph: Graph
  /** Ways whose bounding box overlaps the one of this way, without the way itself */
  waysNear(way: OsmWay): OsmWay[]
  /**
   * The ids this run validates, which is what was changed. A rule about groups needs it: a road
   * that reaches a road nobody changed is connected to the network.
   */
  validated: ReadonlySet<string>
}

/** A check that looks at one entity and reports what is wrong with it */
export type Rule = {
  id: string
  /** For a list of rules, e.g. "Crossing ways" */
  label: string
  validate(entity: OsmEntity, context: RuleContext): Issue[]
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
  /** Drops every issue whose first entity is not in `entityIds`: what is no longer changed is no longer reported */
  keepOnly(entityIds: Iterable<string>): void
  /** All issues, errors first, then by rule and id */
  issues(): readonly Issue[]
  /** The issues an entity is part of */
  issuesFor(entityId: string): readonly Issue[]
}
