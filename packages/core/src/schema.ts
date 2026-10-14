import { RulesetSchema, type Context, type PresetMatch } from '@osm-editor-kit/maid-model'
import type { Geometry, Presets } from '@osm-editor-kit/maid-presets'
import { osmRulesets } from './osm-rulesets.ts'

/**
 * The model's schema lookup, answered from the editor's presets: which preset matches (the model
 * asks when it deletes a way and has to decide about its nodes) and which keys make a closed way
 * an area. Rapid's rulesets are merged as well: the model answers "is this a oneway", "is this way
 * sided", "is this tag uninteresting" and the lifecycle prefixes from them, and answers "no" without.
 * `osm-rulesets.ts` holds the model's `osm_rulesets.json5` as a module (Vite reads no JSON5); `schema.test.ts`
 * fails when the two differ.
 */
export class PresetSchema extends RulesetSchema {
  constructor(
    context: Context,
    private presets: Presets,
  ) {
    super(context)
    this.merge(osmRulesets)
    this.getScope('osm').areaKeys = presets.areaKeys()
  }

  public override matchTags(
    tags: Record<string, string>,
    geometry: string,
    loc?: readonly [number, number],
  ): PresetMatch {
    const preset = this.presets.match(tags, geometry as Geometry, loc)
    // the same answer as the presets' own (iD's preset.isFallback): no tags, or only area=*
    return { isFallback: () => this.presets.isFallback(preset) }
  }
}
