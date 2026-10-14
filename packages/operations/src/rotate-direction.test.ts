// Ported from iD's branch rotate-point-direction: test/spec/util/direction_degrees.ts,
// test/spec/util/direction_field.ts, test/spec/actions/rotate_point_direction.ts and
// test/spec/operations/rotate.ts. The preset cases of iD's operation test take the preset's field list here
// (numericDirectionFieldKey), since the operations package has no presets; the renderer's transform.test.ts
// reads the real presets. Maid turns the value to the pointer's absolute bearing, as iD does.
// The vertex and multi-node cases of iD's operation test are in renderer transform.test.ts.
import { describe, expect, test } from 'bun:test'
import {
  hasDirectionDegrees,
  isDirectionKey,
  normalizeAzimuthDegrees,
  numericDirectionFieldKey,
  parseDirectionDegreesSegment,
  retargetDirectionValue,
  rotatableDirectionKey,
  showsDirectionRotateHint,
} from './rotate-direction.ts'

describe('normalizeAzimuthDegrees', () => {
  test('wraps into [0, 360)', () => {
    expect(normalizeAzimuthDegrees(0)).toEqual(0)
    expect(normalizeAzimuthDegrees(360)).toEqual(0)
    expect(normalizeAzimuthDegrees(-15)).toEqual(345)
    expect(normalizeAzimuthDegrees(370)).toEqual(10)
  })
})

describe('parseDirectionDegreesSegment', () => {
  test('parses numbers and cardinals', () => {
    expect(parseDirectionDegreesSegment('90')).toEqual(90)
    expect(parseDirectionDegreesSegment('N')).toEqual(0)
    expect(parseDirectionDegreesSegment('ne')).toEqual(45)
    expect(parseDirectionDegreesSegment(' 270 ')).toEqual(270)
  })

  test('rejects empty and relative or junk values', () => {
    expect(parseDirectionDegreesSegment('')).toBeUndefined()
    expect(parseDirectionDegreesSegment('forward')).toBeUndefined()
    expect(parseDirectionDegreesSegment('error')).toBeUndefined()
  })
})

describe('hasDirectionDegrees', () => {
  test('detects any parseable semicolon segment', () => {
    expect(hasDirectionDegrees('120;300')).toBe(true)
    expect(hasDirectionDegrees('N')).toBe(true)
    expect(hasDirectionDegrees('forward;90')).toBe(true)
    expect(hasDirectionDegrees('forward')).toBe(false)
    expect(hasDirectionDegrees(undefined)).toBe(false)
    expect(hasDirectionDegrees('')).toBe(false)
  })
})

describe('retargetDirectionValue', () => {
  test('sets an absent or empty value to the target', () => {
    expect(retargetDirectionValue(undefined, 123.4)).toEqual('123')
    expect(retargetDirectionValue('', 90)).toEqual('90')
  })

  test('applies a shared delta across multi-value tags', () => {
    expect(retargetDirectionValue('120;300', 90)).toEqual('90;270')
    expect(retargetDirectionValue('N;90', 45)).toEqual('45;135')
  })

  test('preserves unparsable segments', () => {
    expect(retargetDirectionValue('120;error;300', 90)).toEqual('90;error;270')
  })

  test('leaves all-junk values unchanged', () => {
    expect(retargetDirectionValue('forward', 45)).toEqual('forward')
  })

  test('converts cardinals to numeric degrees', () => {
    expect(retargetDirectionValue('N', 45)).toEqual('45')
    expect(retargetDirectionValue('ne', 90)).toEqual('90')
  })

  test('wraps the target and rounds it to whole degrees', () => {
    expect(retargetDirectionValue('5', -15)).toEqual('345')
    expect(retargetDirectionValue('10', 10.123456)).toEqual('10')
  })
})

describe('isDirectionKey', () => {
  test('recognizes direction and *:direction keys', () => {
    expect(isDirectionKey('direction')).toBe(true)
    expect(isDirectionKey('camera:direction')).toBe(true)
    expect(isDirectionKey('highway')).toBe(false)
    expect(isDirectionKey(undefined)).toBe(false)
  })
})

describe('showsDirectionRotateHint', () => {
  test('only for a numeric direction field', () => {
    expect(showsDirectionRotateHint({ key: 'direction', fieldType: 'number' })).toBe(true)
    expect(showsDirectionRotateHint({ key: 'camera:direction', fieldType: 'number' })).toBe(true)
    expect(showsDirectionRotateHint({ key: 'direction', fieldType: 'combo' })).toBe(false)
    expect(showsDirectionRotateHint({ key: 'direction' })).toBe(false)
    expect(showsDirectionRotateHint({ key: 'highway', fieldType: 'number' })).toBe(false)
  })

  test('a raw tag (no field) shows it when its value is an angle, as iD does', () => {
    expect(showsDirectionRotateHint({ key: 'direction', value: '120' })).toBe(true)
    expect(showsDirectionRotateHint({ key: 'direction', value: 'NE' })).toBe(true)
    expect(showsDirectionRotateHint({ key: 'direction', value: 'forward' })).toBe(false)
    expect(showsDirectionRotateHint({ key: 'highway', value: '120' })).toBe(false)
  })
})

describe('numericDirectionFieldKey (the preset fallback: the field R sets on a point with no tag)', () => {
  test('a bench: the numeric direction field of its preset', () => {
    // id-tagging-schema: amenity/bench offers `direction` (type number) under more fields
    const fields = [
      { key: 'backrest', type: 'check' },
      { key: 'direction', type: 'number' },
    ]
    expect(numericDirectionFieldKey(fields, 'point')).toBe('direction')
    expect(numericDirectionFieldKey(fields, 'vertex')).toBe('direction')
  })

  test('a relative direction field of the preset is not a numeric field', () => {
    expect(
      numericDirectionFieldKey([{ key: 'direction', type: 'combo' }], 'vertex'),
    ).toBeUndefined()
    expect(numericDirectionFieldKey([{ key: 'highway', type: 'number' }], 'point')).toBeUndefined()
    expect(numericDirectionFieldKey([], 'point')).toBeUndefined()
  })

  test('a camera: camera:direction when the preset has it', () => {
    const fields = [
      { key: 'surveillance', type: 'combo' },
      { key: 'camera:direction', type: 'number' },
    ]
    expect(numericDirectionFieldKey(fields, 'point')).toBe('camera:direction')
  })

  test('a field restricted to other geometries does not apply', () => {
    const fields = [{ key: 'direction', type: 'number', geometry: ['vertex'] }]
    expect(numericDirectionFieldKey(fields, 'point')).toBeUndefined()
    expect(numericDirectionFieldKey(fields, 'vertex')).toBe('direction')
  })
})

describe('rotatableDirectionKey (which tag R turns on a point)', () => {
  test('a numeric direction', () => {
    expect(rotatableDirectionKey({ direction: '45' })).toBe('direction')
  })

  test('a multi-value direction', () => {
    expect(rotatableDirectionKey({ direction: '120;300' })).toBe('direction')
  })

  test('a cardinal direction', () => {
    expect(rotatableDirectionKey({ direction: 'N' })).toBe('direction')
  })

  test('a numeric camera:direction', () => {
    expect(rotatableDirectionKey({ 'camera:direction': '90' })).toBe('camera:direction')
  })

  test('a prefixed numeric direction is preferred over direction', () => {
    expect(
      rotatableDirectionKey({
        man_made: 'surveillance',
        'camera:direction': '45',
        direction: '10',
      }),
    ).toBe('camera:direction')
  })

  test('a relative direction is not turned', () => {
    expect(rotatableDirectionKey({ highway: 'give_way', direction: 'forward' })).toBeUndefined()
  })

  test('a point without a direction tag turns nothing without its preset key', () => {
    expect(rotatableDirectionKey({ amenity: 'bench' })).toBeUndefined()
  })

  test('a point with no direction tag turns the key of its preset field', () => {
    expect(rotatableDirectionKey({ amenity: 'bench' }, 'direction')).toBe('direction')
    expect(rotatableDirectionKey({ man_made: 'surveillance' }, 'camera:direction')).toBe(
      'camera:direction',
    )
  })

  test('the preset key is not used when a direction key is there with a relative value', () => {
    expect(
      rotatableDirectionKey({ highway: 'give_way', direction: 'forward' }, 'direction'),
    ).toBeUndefined()
    expect(rotatableDirectionKey({ 'camera:direction': 'forward' }, 'direction')).toBeUndefined()
  })

  test('a numeric tag wins over the preset key', () => {
    expect(rotatableDirectionKey({ direction: '45' }, 'camera:direction')).toBe('direction')
  })
})
