import { describe, expect, it } from 'bun:test'
import { createEditor } from '@osm-editor-kit/maid-core'
import { OsmWay } from '@osm-editor-kit/maid-model'
import { defaultPresetData, defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { isArea } from '@osm-editor-kit/maid-style'

/**
 * Maid answers "is this closed way an area?" in two places: the model (OsmWay.isArea, from the live presets' area keys
 * and Rapid's rulesets, used by validation and the relation rules) and the style (isArea, from area-keys.json
 * generated from iD's presets, used to draw the map and by the inspector). They must agree, or the map draws an area
 * that a check calls a line. This test asks both for every preset's own tags as a closed way; a new schema without a
 * regenerated style list (`bun run style-generate`) shows here.
 */
describe('the area rule of the model and of the style', () => {
  it('agree for the tags of every preset of the bundled schema', () => {
    const editor = createEditor({ presets: defaultPresets })
    const context = (editor as unknown as { context: ConstructorParameters<typeof OsmWay>[0] })
      .context
    const differ: string[] = []
    for (const [id, raw] of Object.entries(defaultPresetData.presets as Record<string, unknown>)) {
      const preset = raw as { tags?: Record<string, string>; geometry?: string[] }
      if (!preset.geometry?.some((g) => g === 'area' || g === 'line')) continue
      const tags = Object.fromEntries(
        Object.entries(preset.tags ?? {}).map(([k, v]) => [k, v === '*' ? 'yes' : v]),
      )
      if (Object.keys(tags).length === 0) continue
      const way = new OsmWay(context, { id: 'w-1', nodes: ['n1', 'n2', 'n3', 'n1'], tags })
      if (way.isArea() !== isArea(tags, true)) differ.push(id)
    }
    expect(differ).toEqual([])
  })
})
