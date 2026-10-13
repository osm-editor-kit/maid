/**
 * What the data model needs from its surroundings, and nothing more.
 *
 * Rapid passes its whole application `Context` into every entity and graph. The model only ever
 * uses three things from it: id sequences, and (in a few tag questions) the tagging schema.
 * Maid keeps Rapid's constructor shape, `new OsmNode(context, props)`, so the ported code and
 * tests stay close to the original, but `Context` here is this small interface. The model runs
 * with nothing else loaded: in a test, in a worker, in another app.
 */

import type { RulesetScope } from './schema/RulesetSchema.ts'

/** The parts of the tagging schema the model asks about. All optional: without a schema the model falls back to plain tag checks. */
export interface SchemaLookup {
  getScope(scopeID: string): RulesetScope
  removeLifecyclePrefix(key: string): string
  /** Preset lookup. Optional: the ruleset-only schema has no presets. */
  // oxlint-disable-next-line typescript/no-explicit-any -- a preset, which the model does not port
  // `loc` is the place of the feature, where its location-bound presets apply; absent: everywhere
  matchTags(tags: Record<string, string>, geometry: string, loc?: readonly [number, number]): any
}

export interface Context {
  /** Returns the next number in a named sequence: 'node', 'way', 'relation', 'graph', 'v' */
  next(which: SequenceID): number
  sequences: Record<SequenceID, number>
  systems: { schema?: SchemaLookup }
}

/** The default implementation: counters in memory. */
export class ModelContext implements Context {
  public sequences: Record<SequenceID, number> = {}
  public systems: { schema?: SchemaLookup } = {}

  public next(which: SequenceID): number {
    const num = (this.sequences[which] ?? 0) + 1
    this.sequences[which] = num
    return num
  }
}
