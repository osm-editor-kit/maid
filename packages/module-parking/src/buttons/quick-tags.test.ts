import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseSideKey } from '../sides.ts'
import { QUICK_TAG_ROWS, QUICK_TAGS } from './quick-tags.ts'

/**
 * The 33 buttons of the mapping project's JOSM file street_parking_hot_buttons.xml, typed by hand from the file:
 * [name, key, value]. Each item of the file has one `<key key=... value=... match="keyvalue">`.
 */
const XML_BUTTONS: [string, string, string][] = [
  ['parking_left_no', 'parking:left', 'no'],
  ['parking_right_no', 'parking:right', 'no'],
  ['parking_both_no', 'parking:both', 'no'],
  ['parking_left_lane', 'parking:left', 'lane'],
  ['parking_right_lane', 'parking:right', 'lane'],
  ['parking_both_lane', 'parking:both', 'lane'],
  ['parking_left_separate', 'parking:left', 'separate'],
  ['parking_right_separate', 'parking:right', 'separate'],
  ['parking_both_separate', 'parking:both', 'separate'],
  ['parking_left_orientation_parallel', 'parking:left:orientation', 'parallel'],
  ['parking_right_orientation_parallel', 'parking:right:orientation', 'parallel'],
  ['parking_both_orientation_parallel', 'parking:both:orientation', 'parallel'],
  ['parking_left_orientation_diagonal', 'parking:left:orientation', 'diagonal'],
  ['parking_right_orientation_diagonal', 'parking:right:orientation', 'diagonal'],
  ['parking_both_orientation_diagonal', 'parking:both:orientation', 'diagonal'],
  ['parking_left_orientation_perpendicular', 'parking:left:orientation', 'perpendicular'],
  ['parking_right_orientation_perpendicular', 'parking:right:orientation', 'perpendicular'],
  ['parking_both_orientation_perpendicular', 'parking:both:orientation', 'perpendicular'],
  ['parking_left_restriction_no_stopping', 'parking:left:restriction', 'no_stopping'],
  ['parking_right_restriction_no_stopping', 'parking:right:restriction', 'no_stopping'],
  ['parking_both_restriction_no_stopping', 'parking:both:restriction', 'no_stopping'],
  ['parking_left_restriction_no_parking', 'parking:left:restriction', 'no_parking'],
  ['parking_right_restriction_no_parking', 'parking:right:restriction', 'no_parking'],
  ['parking_both_restriction_no_parking', 'parking:both:restriction', 'no_parking'],
  ['parking_left_fee_yes', 'parking:left:fee', 'yes'],
  ['parking_right_fee_yes', 'parking:right:fee', 'yes'],
  ['parking_both_fee_yes', 'parking:both:fee', 'yes'],
  ['parking_left_fee_no', 'parking:left:fee', 'no'],
  ['parking_right_fee_no', 'parking:right:fee', 'no'],
  ['parking_both_fee_no', 'parking:both:fee', 'no'],
  ['parking_left_markings_yes', 'parking:left:markings', 'yes'],
  ['parking_right_markings_yes', 'parking:right:markings', 'yes'],
  ['parking_both_markings_yes', 'parking:both:markings', 'yes'],
]

const ICON_DIR = join(import.meta.dir, '..', 'icons')

describe('the 33 source buttons', () => {
  const xml = QUICK_TAGS.filter((tag) => tag.source === 'xml')

  test('there are 33, in the file order, with the file tags', () => {
    expect(xml.map((tag) => tag.id)).toEqual(XML_BUTTONS.map(([name]) => name))
    for (const [name, key, value] of XML_BUTTONS) {
      const tag = QUICK_TAGS.find((item) => item.id === name)
      expect(tag?.edits).toEqual([{ key, value }])
    }
  })

  test('each has an icon file of its own name, and labels in English and German', () => {
    for (const tag of xml) {
      expect(tag.icon).toBe(tag.id)
      expect(existsSync(join(ICON_DIR, `${tag.id}.png`))).toBe(true)
      expect(tag.label.length).toBeGreaterThan(0)
      expect(tag.labelDe.length).toBeGreaterThan(0)
      expect(tag.origin).toBeUndefined()
    }
  })

  test('the side of each button matches its name, and it has a grid row', () => {
    for (const tag of xml) {
      const side = tag.id.split('_')[1]
      expect(tag.side).toBe(side as 'left' | 'right' | 'both')
      expect(tag.row).toBeDefined()
      expect(QUICK_TAG_ROWS.some((row) => row.id === tag.row)).toBe(true)
    }
  })

  test('the grid is 14 rows of 3 columns: 11 source topics and 3 reasons, every cell filled once', () => {
    expect(QUICK_TAG_ROWS).toHaveLength(14)
    const cells = QUICK_TAGS.filter((tag) => tag.row !== undefined).map(
      (tag) => `${tag.row}/${tag.side}`,
    )
    expect(new Set(cells).size).toBe(42)
    for (const row of QUICK_TAG_ROWS) {
      for (const side of ['left', 'right', 'both']) expect(cells).toContain(`${row.id}/${side}`)
    }
  })
})

describe("Maid's additions", () => {
  const added = QUICK_TAGS.filter((tag) => tag.source === 'maid')

  test('every addition names its origin in the documents or says why it has none', () => {
    expect(added.length).toBeGreaterThan(0)
    for (const tag of added) expect(tag.origin?.length ?? 0).toBeGreaterThan(0)
  })

  test('the ids are unique and every key of every button is a parking side key', () => {
    const ids = QUICK_TAGS.map((tag) => tag.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const tag of QUICK_TAGS) {
      for (const edit of tag.edits) {
        expect(parseSideKey(edit.key)).toBeDefined()
        expect(edit.value).toBeDefined()
      }
    }
  })

  test('the combined buttons set the tags of their documents', () => {
    const both = QUICK_TAGS.find((tag) => tag.id === 'maid_both_lane_parallel')
    expect(both?.edits).toEqual([
      { key: 'parking:left', value: 'lane' },
      { key: 'parking:left:orientation', value: 'parallel' },
      { key: 'parking:right', value: 'lane' },
      { key: 'parking:right:orientation', value: 'parallel' },
    ])
    const reason = QUICK_TAGS.find((tag) => tag.id === 'maid_right_no_reason_structure')
    expect(reason?.edits).toEqual([
      { key: 'parking:right', value: 'no' },
      { key: 'parking:right:reason', value: 'structure' },
    ])
  })

  test('the clearing buttons clear one side and set no tag', () => {
    for (const side of ['left', 'right'] as const) {
      const clear = QUICK_TAGS.find((tag) => tag.id === `maid_clear_${side}`)
      expect(clear?.clearSide).toBe(side)
      expect(clear?.edits).toEqual([])
    }
  })
})
