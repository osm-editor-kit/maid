import { RulesetSchema, type Context, type PresetMatch } from '@osm-editor-kit/maid-model'
import type { Geometry, Presets } from '@osm-editor-kit/maid-presets'

/**
 * The model's schema lookup, answered from the editor's presets: which preset matches (the model
 * asks when it deletes a way and has to decide about its nodes) and which keys make a closed way
 * an area. Rapid's rulesets (`osm_rulesets.json5`) are not loaded yet.
 */
export class PresetSchema extends RulesetSchema {
  constructor(
    context: Context,
    private presets: Presets,
  ) {
    super(context)
    this.getScope('osm').areaKeys = presets.areaKeys()
  }

  public override matchTags(tags: Record<string, string>, geometry: string): PresetMatch {
    const preset = this.presets.match(tags, geometry as Geometry)
    // the generic presets (point, line, area, relation) are the ones without tags
    return { isFallback: () => Object.keys(preset.tags).length === 0 }
  }
}
