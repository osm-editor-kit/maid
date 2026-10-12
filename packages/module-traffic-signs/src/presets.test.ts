import { describe, expect, it } from 'bun:test'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { TRAFFIC_SIGN_FIELD_TYPE, trafficSignPresetChanges } from './presets.ts'

const presets = createPresets(withChanges(defaultPresetData, trafficSignPresetChanges))

function fieldIds(tags: Record<string, string>, geometry: 'line' | 'point' = 'line') {
  const preset = presets.match(tags, geometry)
  if (!preset) throw new Error(`no preset for ${JSON.stringify(tags)}`)
  return presets.fieldsFor(preset, tags, geometry).map((field) => field.id)
}

describe('trafficSignPresetChanges', () => {
  it('applies to the default data without an error', () => {
    expect(() => withChanges(defaultPresetData, trafficSignPresetChanges)).not.toThrow()
  })

  it('shows the way sign on a residential road, with the field type of the module', () => {
    const preset = presets.match({ highway: 'residential' }, 'line')
    expect(preset?.id).toBe('highway/residential')
    const fields = presets.fieldsFor(preset!, { highway: 'residential' }, 'line')
    const sign = fields.find((field) => field.id === 'traffic_sign_way')
    expect(sign?.type).toBe(TRAFFIC_SIGN_FIELD_TYPE)
    expect(sign?.key).toBe('traffic_sign')
    expect(sign?.label).toBe('Traffic Sign')
  })

  it('shows the way sign on the roads that take their list from primary or residential', () => {
    expect(fieldIds({ highway: 'secondary' })).toContain('traffic_sign_way')
    expect(fieldIds({ highway: 'tertiary' })).toContain('traffic_sign_way')
    expect(fieldIds({ highway: 'unclassified' })).toContain('traffic_sign_way')
  })

  it('shows the way sign on cycleways, paths and footways', () => {
    expect(fieldIds({ highway: 'cycleway' })).toContain('traffic_sign_way')
    expect(fieldIds({ highway: 'path', bicycle: 'designated' })).toContain('traffic_sign_way')
    expect(fieldIds({ highway: 'footway' })).toContain('traffic_sign_way')
  })

  it('shows the direction and side fields only once they have a value', () => {
    expect(fieldIds({ highway: 'residential' })).not.toContain('traffic_sign_forward')
    expect(fieldIds({ highway: 'residential', 'traffic_sign:forward': 'DE:274' })).toContain(
      'traffic_sign_forward',
    )
    expect(fieldIds({ highway: 'residential', 'cycleway:right:traffic_sign': 'DE:237' })).toContain(
      'cycleway_right_traffic_sign',
    )
    expect(fieldIds({ highway: 'residential', 'sidewalk:left:traffic_sign': 'DE:239' })).toContain(
      'sidewalk_left_traffic_sign',
    )
  })

  it('shows the direction fields on paths but no side fields', () => {
    const ids = fieldIds({ highway: 'footway', 'traffic_sign:backward': 'DE:239' })
    expect(ids).toContain('traffic_sign_backward')
    expect(ids).not.toContain('cycleway_right_traffic_sign')
  })

  it('leaves the sign presets alone: they keep the base traffic_sign field', () => {
    const ids = fieldIds({ highway: 'traffic_sign', traffic_sign: 'DE:274' }, 'point')
    expect(ids).not.toContain('traffic_sign_way')
  })
})
