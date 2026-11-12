import { describe, expect, test } from 'bun:test'
import { sceneBands } from './scene-bands.ts'

const KMS = {
  'bicycle:lanes:forward': 'no|designated|yes',
  'cycleway:both': 'lane',
  'cycleway:both:width': '2',
  'cycleway:lanes:forward': 'no|lane|no',
  highway: 'secondary',
  lanes: '3',
  'lanes:backward': '1',
  'lanes:forward': '2',
  'placement:forward': 'left_of:1',
  'turn:lanes:forward': 'through|through|right',
  'vehicle:lanes:forward': 'yes|no|yes',
  'width:lanes:backward': '3.4',
  'width:lanes:forward': '3.4|2|3',
}

describe('sceneBands', () => {
  test('Karl-Marx-Straße: the lanes of the diagram, the left cycle lane included', () => {
    const bands = sceneBands(1, KMS)
    expect(bands.map((band) => [band.slotId, band.kind])).toEqual([
      ['way/1/lane/backward/10000', 'bicycle'],
      ['way/1/lane/backward/0', 'car'],
      ['way/1/lane/forward/0', 'car'],
      ['way/1/lane/forward/1', 'bicycle'],
      ['way/1/lane/forward/2', 'car'],
    ])
  })

  test('placement:forward=left_of:1: the way runs between the backward and the first forward lane', () => {
    const bands = sceneBands(1, KMS)
    const back = bands.find((band) => band.slotId === 'way/1/lane/backward/0')!
    const first = bands.find((band) => band.slotId === 'way/1/lane/forward/0')!
    expect(back.offsetMetres + back.widthMetres / 2).toBeCloseTo(0, 1)
    expect(first.offsetMetres - first.widthMetres / 2).toBeCloseTo(0, 1)
  })

  test('a centred two-way road, and oneway=-1 turned round', () => {
    const two = sceneBands(1, { highway: 'secondary', lanes: '2' })
    expect(two.map((band) => Math.round(band.offsetMetres * 10) / 10)).toEqual([-1.5, 1.5])
    const reverse = sceneBands(1, {
      highway: 'primary',
      oneway: '-1',
      lanes: '2',
      'turn:lanes': 'left|through',
    })
    expect(reverse.map((band) => band.turn)).toEqual(['left', 'through'])
    expect(reverse[0]!.offsetMetres).toBeGreaterThan(0)
  })
})
