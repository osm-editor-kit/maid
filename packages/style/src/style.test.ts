import { expect, test } from 'bun:test'
import { isArea, resolveWayStyle, tagClasses, wayLayer } from './index'

test('residential road gets iD colours and widths', () => {
  const style = resolveWayStyle(tagClasses({ highway: 'residential' }), 'line')
  expect(style.stroke).toMatchObject({ color: '#fff', width: 8, widthLow: 5 })
  expect(style.casing).toMatchObject({ color: '#444', width: 10, widthLow: 7 })
})

test('motorway bridge', () => {
  const classes = tagClasses({ highway: 'motorway', bridge: 'yes' })
  expect(classes).toContain('bridge')
  expect(resolveWayStyle(classes, 'line').stroke.color).toBe('#CF2081')
  expect(wayLayer({ highway: 'motorway', bridge: 'yes' })).toBe(1)
})

test('footway is dashed', () => {
  expect(resolveWayStyle(tagClasses({ highway: 'footway' }), 'line').stroke.dash).toBeDefined()
})

test('areas', () => {
  expect(isArea({ building: 'yes' }, true)).toBe(true)
  expect(isArea({ highway: 'residential' }, true)).toBe(false)
  expect(isArea({ highway: 'pedestrian', area: 'yes' }, true)).toBe(true)
  expect(isArea({ building: 'yes' }, false)).toBe(false)
  const park = resolveWayStyle(tagClasses({ leisure: 'park' }), 'area')
  expect(park.fill).toContain('rgba(140, 208, 95')
  expect(resolveWayStyle(tagClasses({ building: 'yes' }), 'area').stroke.color).toBe(
    'rgb(224, 110, 95)',
  )
})
