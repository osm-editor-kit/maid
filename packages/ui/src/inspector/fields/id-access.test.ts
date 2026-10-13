// Adopted from iD test/spec/ui/fields/access.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's access field writes one row per key and shows each row's placeholder in the DOM. Maid's
// AccessField shows the same options (accessOptions) and the same placeholder (impliedAccess).
import { describe, expect, it } from 'bun:test'
import type { Tags } from '@osm-editor-kit/maid-presets'
import { MULTIPLE_VALUES } from './mixed-logic.ts'
import { accessOptions, accessPlaceholder, impliedAccess } from './radio-logic.ts'

const values = (key: string) => accessOptions(key).map((option) => option.value)

describe('iD.uiFieldAccess', () => {
  it.todo('creates inputs for a variety of modes of access', () => {}) // needs F-ui-7

  it('does not include "yes", "designated", "dismount" options for general access (#934), (#2213)', () => {
    const options = values('access')
    expect(options).not.toContain('yes')
    expect(options).not.toContain('designated')
    expect(options).not.toContain('dismount')
  })

  it('does include a "dismount" option for bicycles (#2726)', () => {
    expect(values('bicycle')).toContain('dismount')
    expect(values('foot')).not.toContain('dismount')
  })

  it('sets foot placeholder to "yes" for steps and pedestrian', () => {
    expect(impliedAccess({ highway: 'steps' }, 'foot')).toBe('yes')
    expect(impliedAccess({ highway: 'pedestrian' }, 'foot')).toBe('yes')
  })

  it('sets foot placeholder to "designated" for footways', () => {
    expect(impliedAccess({ highway: 'footway' }, 'foot')).toBe('designated')
  })

  it('sets bicycle placeholder to "designated" for cycleways', () => {
    expect(impliedAccess({ highway: 'cycleway' }, 'bicycle')).toBe('designated')
  })

  it('sets horse placeholder to "designated" for bridleways', () => {
    expect(impliedAccess({ highway: 'bridleway' }, 'horse')).toBe('designated')
  })

  it('sets motor_vehicle placeholder to "no" for footways, steps, pedestrian, cycleway, bridleway, and path', () => {
    for (const value of ['footway', 'steps', 'pedestrian', 'cycleway', 'bridleway', 'path']) {
      expect(impliedAccess({ highway: value }, 'motor_vehicle')).toBe('no')
    }
  })

  it('sets motor_vehicle placeholder to "yes" for various other highway tags', () => {
    for (const value of [
      'residential',
      'motorway',
      'trunk',
      'primary',
      'secondary',
      'tertiary',
      'service',
      'unclassified',
      'motorway_link',
      'trunk_link',
      'primary_link',
      'secondary_link',
      'tertiary_link',
    ]) {
      expect(impliedAccess({ highway: value }, 'motor_vehicle')).toBe('yes')
    }
  })

  it('overrides a "yes" or "designated" placeholder with more specific access tag (#2213)', () => {
    expect(impliedAccess({ highway: 'service', access: 'emergency' }, 'motor_vehicle')).toBe(
      'emergency',
    )
    expect(impliedAccess({ highway: 'cycleway', access: 'permissive' }, 'bicycle')).toBe(
      'permissive',
    )
  })

  it('overrides a "no" placeholder with more specific access tag (#2763)', () => {
    expect(impliedAccess({ highway: 'cycleway', access: 'destination' }, 'motor_vehicle')).toBe(
      'destination',
    )
  })

  it('sets bicycle and motor_vehicle placeholder to the value of the "vehicle" tag (id-tagging-schema#378)', () => {
    const tags: Tags = { highway: 'residential', vehicle: 'destination' }
    expect(impliedAccess(tags, 'motor_vehicle')).toBe('destination')
    expect(impliedAccess(tags, 'bicycle')).toBe('destination')
  })

  it('sets foot, bicycle and horse placeholder to "no" when there a "motorroad=yes" tag (#9333)', () => {
    const tags: Tags = { highway: 'primary', motorroad: 'yes' }
    expect(impliedAccess(tags, 'foot')).toBe('no')
    expect(impliedAccess(tags, 'bicycle')).toBe('no')
    expect(impliedAccess(tags, 'horse')).toBe('no')
  })

  it('sets correct placeholder on a multi selection', () => {
    // iD's tags: highway=primary on both, foot yes and no, bicycle no and absent, vehicle no and absent.
    // Maid gives the features' own tags to accessPlaceholder; the shared tags hold only highway.
    const features: Tags[] = [
      { highway: 'primary', foot: 'yes', bicycle: 'no' },
      { highway: 'primary', foot: 'no', vehicle: 'no' },
    ]
    const shared: Tags = { highway: 'primary' }
    expect(accessPlaceholder('foot', shared, features)).toBe(MULTIPLE_VALUES)
    expect(accessPlaceholder('bicycle', shared, features)).toBe('no')
    expect(accessPlaceholder('motor_vehicle', shared, features)).toBe(MULTIPLE_VALUES)
  })
})
