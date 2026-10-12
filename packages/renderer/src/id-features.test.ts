// Adopted from iD test/spec/renderer/features.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { createFilterSet, defaultFilters } from '@osm-editor-kit/maid-filters'
import { EditHistory, ModelContext } from '@osm-editor-kit/maid-model'
import { FeatureBuilder } from './build'
import { OsmData } from './data'

describe('iD.rendererFeatures (hiding in the feature builder)', () => {
  it('hides child vertices on a hidden way', () => {
    const context = new ModelContext()
    const data = new OsmData(context, new EditHistory(context))
    const builder = new FeatureBuilder(data)
    builder.filters = createFilterSet(defaultFilters, 'paths:hidden')
    const batch = builder.build(
      data.merge([
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'node', id: 2, lat: 1, lon: 1 },
        { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'path' } },
      ]),
    )
    // the way is hidden, so neither its line nor its end vertices are drawn
    expect(batch.lines).toHaveLength(0)
    expect(batch.vertices).toHaveLength(0)
  })
})
