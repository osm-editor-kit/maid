// The side keys of a road on a reverse: rows A to G of docs/research/reverse-side-keys.md (Tobias, 2026-11-27)
import { describe, expect, it } from 'bun:test';
import { reverseWayTags } from './reverse.ts';

describe('reverseWayTags: the sides of a road (docs/research/reverse-side-keys.md)', () => {
  it('A: a second side of a two-way road stays', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:both': 'lane', 'cycleway:both:marking:left': 'dashed_line' })).toEqual({
      highway: 'residential',
      'cycleway:both': 'lane',
      'cycleway:both:marking:left': 'dashed_line',
    });
  });

  it('B: explicit lane directions of a two-way road keep the lanes where they ride', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:left:oneway': '-1', 'cycleway:right:oneway': 'yes' })).toEqual({
      highway: 'residential',
      'cycleway:right:oneway': 'yes',
      'cycleway:left:oneway': '-1',
    });
  });

  it('C: the road side swaps, the second side stays', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:right': 'lane', 'cycleway:right:separation:left': 'bollard' })).toEqual({
      highway: 'residential',
      'cycleway:left': 'lane',
      'cycleway:left:separation:left': 'bollard',
    });
  });

  it('D: a two-way lane keeps its second side and its oneway=no', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:right:oneway': 'no', 'cycleway:right:separation:left': 'kerb' })).toEqual({
      highway: 'residential',
      'cycleway:left:oneway': 'no',
      'cycleway:left:separation:left': 'kerb',
    });
  });

  it('E: on a one-way road V turns the traffic round (iD), so the second side swaps; with reverseOneway it stays', () => {
    const tags = { highway: 'residential', oneway: 'yes', 'cycleway:right': 'lane', 'cycleway:right:separation:left': 'bollard' };
    expect(reverseWayTags(tags)).toEqual({
      highway: 'residential',
      oneway: 'yes',
      'cycleway:left': 'lane',
      'cycleway:left:separation:right': 'bollard',
    });
    expect(reverseWayTags(tags, { reverseOneway: true })).toEqual({
      highway: 'residential',
      oneway: '-1',
      'cycleway:left': 'lane',
      'cycleway:left:separation:left': 'bollard',
    });
  });

  it('E: a contraflow lane of a one-way road stays a contraflow lane', () => {
    expect(reverseWayTags({ highway: 'residential', oneway: 'yes', 'cycleway:left:oneway': '-1' })).toEqual({
      highway: 'residential',
      oneway: 'yes',
      'cycleway:right:oneway': '-1',
    });
    expect(reverseWayTags({ highway: 'residential', oneway: 'yes', 'cycleway:left:oneway': '-1' }, { reverseOneway: true })).toEqual({
      highway: 'residential',
      oneway: '-1',
      'cycleway:right:oneway': 'yes',
    });
  });

  it('F: a one-way cycleway swaps its separation with iD`s V and keeps it with reverseOneway', () => {
    const tags = { highway: 'cycleway', oneway: 'yes', 'separation:left': 'kerb' };
    expect(reverseWayTags(tags)).toEqual({ highway: 'cycleway', oneway: 'yes', 'separation:right': 'kerb' });
    expect(reverseWayTags(tags, { reverseOneway: true })).toEqual({ highway: 'cycleway', oneway: '-1', 'separation:left': 'kerb' });
  });

  it('G: a two-way cycleway swaps its separation, relative to the line', () => {
    expect(reverseWayTags({ highway: 'cycleway', 'separation:left': 'kerb' })).toEqual({ highway: 'cycleway', 'separation:right': 'kerb' });
  });

  it('forward and backward still swap under a road side; red_turn stays', () => {
    expect(reverseWayTags({ 'cycleway:right:lane:forward': 'exclusive', 'red_turn:right': 'no' })).toEqual({
      'cycleway:left:lane:backward': 'exclusive',
      'red_turn:right': 'no',
    });
  });
});
