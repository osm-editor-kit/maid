import { describe, expect, it } from 'bun:test'
import type { Context } from '@osm-editor-kit/maid-model'
import { createPresets } from '@osm-editor-kit/maid-presets'
import rulesetsSource from '../../model/src/schema/osm_rulesets.json5'
import { osmRulesets } from './osm-rulesets.ts'
import { PresetSchema } from './schema.ts'

describe('osm-rulesets.ts', () => {
  it("is the model's osm_rulesets.json5", () => {
    // After the model's file changed, write `export const osmRulesets: RulesetsInput = <the JSON5 as JSON>` again.
    expect(JSON.parse(JSON.stringify(osmRulesets))).toEqual(rulesetsSource)
  })
})

describe('PresetSchema.matchTags', () => {
  // createPresets adds the generic presets. The two tagged ones are what a match can find.
  const presets = createPresets({
    presets: {
      bench: { tags: { amenity: 'bench' }, geometry: ['point', 'vertex'] },
      route: { tags: { type: 'route' }, geometry: ['relation'] },
    },
    fields: {},
    translations: {},
  })
  // the model reads only matchTags here; the context is not used by the presets answer
  const schema = new PresetSchema({} as Context, presets)

  it('is a fallback for a bare point, vertex, area and relation (the generic presets)', () => {
    expect(schema.matchTags({}, 'point')?.isFallback()).toEqual(true)
    expect(schema.matchTags({}, 'vertex')?.isFallback()).toEqual(true)
    expect(schema.matchTags({ area: 'yes' }, 'area')?.isFallback()).toEqual(true)
    expect(schema.matchTags({}, 'relation')?.isFallback()).toEqual(true)
  })

  it('is not a fallback for a tagged point, vertex or relation', () => {
    expect(schema.matchTags({ amenity: 'bench' }, 'point')?.isFallback()).toEqual(false)
    expect(schema.matchTags({ amenity: 'bench' }, 'vertex')?.isFallback()).toEqual(false)
    expect(schema.matchTags({ type: 'route' }, 'relation')?.isFallback()).toEqual(false)
  })

  it('answers what the presets answer for the same match', () => {
    for (const [tags, geometry] of [
      [{}, 'point'],
      [{ amenity: 'bench' }, 'vertex'],
      [{ type: 'route' }, 'relation'],
    ] as const) {
      expect(schema.matchTags({ ...tags }, geometry)?.isFallback()).toEqual(
        presets.isFallback(presets.match({ ...tags }, geometry)),
      )
    }
  })
})
