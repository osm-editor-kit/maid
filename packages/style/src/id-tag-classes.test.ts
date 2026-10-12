// Adopted from iD test/spec/svg/tag_classes.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { tagClasses, type Tags } from './classes'

// iD's class attribute for a set of tags: 'tag-building tag-building-residential', or null when none.
// Maid's tagClasses returns the names without the `tag-` prefix; this helper adds it back.
function classAttr(tags: Tags): string | null {
  const classes = tagClasses(tags)
    .map((c) => `tag-${c}`)
    .join(' ')
  return classes || null
}

// iD's selection.classed('tag-x')
function classed(tags: Tags, cls: string): boolean {
  return tagClasses(tags).includes(cls.replace(/^tag-/, ''))
}

describe('iD.svgTagClasses', () => {
  it('adds no classes to elements whose datum has no tags', () => {
    expect(classAttr({})).toEqual(null)
  })

  it('adds classes for primary tag key and key-value', () => {
    expect(classAttr({ building: 'residential' })).toEqual('tag-building tag-building-residential')
  })

  it('adds only one primary tag', () => {
    expect(classAttr({ building: 'residential', railway: 'rail' })).toEqual(
      'tag-building tag-building-residential',
    )
  })

  it('orders primary tags', () => {
    expect(classAttr({ railway: 'rail', building: 'residential' })).toEqual(
      'tag-building tag-building-residential',
    )
  })

  it('adds status tag when status in primary value (`railway=abandoned`)', () => {
    expect(classAttr({ railway: 'abandoned' })).toEqual(
      'tag-railway tag-status tag-status-abandoned',
    )
  })

  it('adds status tag when status in key and value matches "yes" (railway=rail + abandoned=yes)', () => {
    expect(classAttr({ railway: 'rail', abandoned: 'yes' })).toEqual(
      'tag-railway tag-railway-rail tag-status tag-status-abandoned',
    )
  })

  it('adds status tag when status in key and value matches primary (railway=rail + abandoned=railway)', () => {
    expect(classAttr({ railway: 'rail', abandoned: 'railway' })).toEqual(
      'tag-railway tag-railway-rail tag-status tag-status-abandoned',
    )
  })

  it('adds primary and status tag when status in key and no primary (abandoned=railway)', () => {
    expect(classAttr({ abandoned: 'railway' })).toEqual(
      'tag-railway tag-status tag-status-abandoned',
    )
  })

  it('does not add status tag for different primary tag (highway=path + abandoned=railway)', () => {
    expect(classAttr({ highway: 'path', abandoned: 'railway' })).toEqual(
      'tag-highway tag-highway-path',
    )
  })

  it('adds secondary tags', () => {
    expect(classAttr({ railway: 'rail', bridge: 'yes' })).toEqual(
      'tag-railway tag-railway-rail tag-bridge tag-bridge-yes',
    )
  })

  it('adds no bridge=no tags', () => {
    expect(classAttr({ bridge: 'no' })).toEqual(null)
  })

  describe('surface paving', () => {
    it('does not add tag-unpaved for non-track highways with no surface tagging', () => {
      expect(classed({ highway: 'tertiary' }, 'tag-unpaved')).toBe(false)
      expect(classed({ highway: 'foo' }, 'tag-unpaved')).toBe(false)
    })

    it('does not add tag-unpaved for non-track highways with explicit paved surface tagging', () => {
      expect(classed({ highway: 'tertiary', surface: 'asphalt' }, 'tag-unpaved')).toBe(false)
      expect(classed({ highway: 'foo', tracktype: 'grade1' }, 'tag-unpaved')).toBe(false)
    })

    it('does not add tag-unpaved for aeroways with explicit paved surface tagging', () => {
      expect(classed({ aeroway: 'taxiway', surface: 'asphalt' }, 'tag-unpaved')).toBe(false)
      expect(classed({ aeroway: 'runway', surface: 'paved' }, 'tag-unpaved')).toBe(false)
    })

    it('adds tag-unpaved for non-track highways with explicit unpaved surface tagging', () => {
      expect(classed({ highway: 'tertiary', surface: 'dirt' }, 'tag-unpaved')).toBe(true)
      expect(classed({ highway: 'foo', tracktype: 'grade3' }, 'tag-unpaved')).toBe(true)
    })

    it('adds tag-semipaved for non-track highways with explicit semipaved surface tagging', () => {
      expect(classed({ highway: 'tertiary', surface: 'paving_stones' }, 'tag-unpaved')).toBe(false)
      expect(classed({ highway: 'tertiary', surface: 'paving_stones' }, 'tag-semipaved')).toBe(true)
      expect(classed({ highway: 'foo', surface: 'wood' }, 'tag-unpaved')).toBe(false)
      expect(classed({ highway: 'foo', surface: 'wood' }, 'tag-semipaved')).toBe(true)
    })

    it('adds tag-unpaved for aeroways with explicit unpaved surface tagging', () => {
      expect(classed({ aeroway: 'taxiway', surface: 'dirt' }, 'tag-unpaved')).toBe(true)
      expect(classed({ aeroway: 'runway', surface: 'unpaved' }, 'tag-unpaved')).toBe(true)
    })

    it('adds tag-semipaved for aeroways with explicit semipaved surface tagging', () => {
      expect(classed({ aeroway: 'taxiway', surface: 'paving_stones' }, 'tag-unpaved')).toBe(false)
      expect(classed({ aeroway: 'taxiway', surface: 'paving_stones' }, 'tag-semipaved')).toBe(true)
      expect(classed({ aeroway: 'runway', surface: 'wood' }, 'tag-unpaved')).toBe(false)
      expect(classed({ aeroway: 'runway', surface: 'wood' }, 'tag-semipaved')).toBe(true)
    })

    it('does not add tag-unpaved for non-highways/aeroways', () => {
      expect(classed({ railway: 'abandoned', surface: 'gravel' }, 'tag-unpaved')).toBe(false)
      expect(classed({ amenity: 'parking', surface: 'dirt' }, 'tag-unpaved')).toBe(false)
    })

    it('does not add tag-paved/tag-unpaved for highway=track regardless of surface tagging', () => {
      // i.e. implied unpaved
      expect(classed({ highway: 'track' }, 'tag-paved')).toBe(false)
      expect(classed({ highway: 'track' }, 'tag-unpaved')).toBe(false)
      // i.e. paved
      expect(classed({ highway: 'track', surface: 'asphalt' }, 'tag-paved')).toBe(false)
      expect(classed({ highway: 'track', surface: 'asphalt' }, 'tag-unpaved')).toBe(false)
      // i.e. unpaved
      expect(classed({ highway: 'track', surface: 'gravel' }, 'tag-paved')).toBe(false)
      expect(classed({ highway: 'track', surface: 'gravel' }, 'tag-unpaved')).toBe(false)
      // i.e. paved
      expect(classed({ highway: 'track', tracktype: 'grade1' }, 'tag-paved')).toBe(false)
      expect(classed({ highway: 'track', tracktype: 'grade1' }, 'tag-unpaved')).toBe(false)
      // i.e. unpaved
      expect(classed({ highway: 'track', tracktype: 'grade3' }, 'tag-paved')).toBe(false)
      expect(classed({ highway: 'track', tracktype: 'grade3' }, 'tag-unpaved')).toBe(false)
    })
  })

  describe('track grading', () => {
    it('adds tag-ungraded for highway=track with no grade tagging', () => {
      expect(classed({ highway: 'track' }, 'tag-ungraded')).toBe(true)
    })

    it('adds tag-ungraded for highway=track with unknown grade tagging', () => {
      expect(classed({ highway: 'track', tracktype: 'superb_grade' }, 'tag-ungraded')).toBe(true)
    })

    it('does not add tag-ungraded for highway=track with explicit grade tagging', () => {
      expect(classed({ highway: 'track', tracktype: 'grade3' }, 'tag-ungraded')).toBe(false)
    })

    it('adds tag-ungraded for highway=track even with surface tagging', () => {
      expect(classed({ highway: 'track', surface: 'asphalt' }, 'tag-ungraded')).toBe(true)
      expect(classed({ highway: 'track', surface: 'dirt' }, 'tag-ungraded')).toBe(true)
    })
  })

  it('adds tag-wikidata if entity has a brand:wikidata tag', () => {
    expect(classed({ 'brand:wikidata': 'Q18275868' }, 'tag-wikidata')).toBe(true)
  })

  // iD's `svgTagClasses().tags(accessor)` is the d3 binding that reads the tags of a datum.
  // n/a: Maid calls tagClasses(tags) with the tags themselves, so there is no accessor to test.

  // n/a: iD removes stale `tag-*` classes from a DOM element. Maid computes the classes of a
  // feature from its tags each time it is built; there is no element whose class attribute is kept.

  // n/a: iD keeps non-`tag-` classes (such as `selected`) on the DOM element. Maid's selection
  // and hover are feature state in MapLibre, not classes; tagClasses only returns tag classes.

  // n/a: iD's test uses an SVG <g> element instead of a <div>. Maid draws GeoJSON features with
  // MapLibre layers; there is no SVG element and no namespace to test.

  // iD's stroke override (a closed barrier way is outlined as a line) is decided in the feature
  // builder, not here: see packages/renderer/src/id-tag-classes.test.ts.

  it('normalizes colons in primary tag key to underlines', () => {
    expect(classAttr({ 'piste:type': 'nordic' })).toEqual('tag-piste_type tag-piste_type-nordic')
  })
})
