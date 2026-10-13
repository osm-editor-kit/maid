// Maid's own tests (not from Rapid) for the combined tags of several features and the tags one change writes to them.
// The iD cases for utilCombinedTags are adopted in test/id/util/util.test.ts through combinedToId.
import { describe, expect, it } from 'bun:test'
import { combinedTags, combinedToId, tagChangesFor } from '../../src/util/combined-tags.ts'

/** A seeded generator (mulberry32), so the property test gives the same cases on every run. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('combinedTags', () => {
  it('gives one for every key of one feature', () => {
    expect(combinedTags([{ highway: 'residential', name: 'Main' }])).toEqual({
      highway: { kind: 'one', value: 'residential' },
      name: { kind: 'one', value: 'Main' },
    });
  });

  it('gives one when two features have the same value', () => {
    expect(combinedTags([{ surface: 'paved' }, { surface: 'paved' }])).toEqual({
      surface: { kind: 'one', value: 'paved' },
    });
  });

  it('gives mixed with both values, first-seen first, when two differ', () => {
    expect(combinedTags([{ surface: 'paved' }, { surface: 'gravel' }])).toEqual({
      surface: { kind: 'mixed', values: ['paved', 'gravel'], missing: false },
    });
  });

  it('orders three values with two equal by frequency, not first-seen', () => {
    expect(combinedTags([{ surface: 'gravel' }, { surface: 'paved' }, { surface: 'paved' }])).toEqual({
      surface: { kind: 'mixed', values: ['paved', 'gravel'], missing: false },
    });
  });

  it('marks a key missing on one feature as mixed with missing true', () => {
    expect(combinedTags([{ surface: 'paved' }, {}])).toEqual({
      surface: { kind: 'mixed', values: ['paved'], missing: true },
    });
  });

  it('keeps one value and missing true when the others have it and one lacks it', () => {
    expect(combinedTags([{ surface: 'paved' }, { surface: 'paved' }, {}])).toEqual({
      surface: { kind: 'mixed', values: ['paved'], missing: true },
    });
  });

  it('gives the empty record for no features', () => {
    expect(combinedTags([])).toEqual({});
  });

  it('leaves out a key that no feature has', () => {
    expect(Object.hasOwn(combinedTags([{ a: '1' }, { b: '2' }]), 'c')).toBe(false);
  });
});

describe('combinedToId', () => {
  it('gives a string for one, and the values with undefined last for mixed', () => {
    const combined = combinedTags([{ a: 'x', b: 'p' }, { a: 'y' }, {}]);
    expect(combinedToId(combined)).toEqual({ a: ['x', 'y', undefined], b: ['p', undefined] });
    expect(combinedToId(combinedTags([{ a: 'x' }, { a: 'x' }]))).toEqual({ a: 'x' });
  });
});

describe('tagChangesFor', () => {
  it('sets the key on every feature', () => {
    const result = tagChangesFor([{ a: '1' }, {}], { set: { a: '2' }, remove: [] });
    expect(result).toEqual({ next: [{ a: '2' }, { a: '2' }], changed: 2 });
  });

  it('leaves a feature that already has the value unchanged', () => {
    const result = tagChangesFor([{ a: '2' }, { a: '1' }], { set: { a: '2' }, remove: [] });
    expect(result).toEqual({ next: [undefined, { a: '2' }], changed: 1 });
  });

  it('removes the key only where some features have it', () => {
    const result = tagChangesFor([{ a: '1' }, {}], { set: {}, remove: ['a'] });
    expect(result).toEqual({ next: [{}, undefined], changed: 1 });
  });

  it('renames with a remove and a set', () => {
    const result = tagChangesFor([{ old: '1' }, { old: '1' }], { set: { new: '1' }, remove: ['old'] });
    expect(result).toEqual({ next: [{ new: '1' }, { new: '1' }], changed: 2 });
  });

  it('sets a key that is also in remove, so the key is set', () => {
    const result = tagChangesFor([{ a: '1' }, {}], { set: { a: '2' }, remove: ['a'] });
    expect(result).toEqual({ next: [{ a: '2' }, { a: '2' }], changed: 2 });
  });

  it('changes nothing when the change is empty or already true', () => {
    expect(tagChangesFor([{ a: '1' }], { set: {}, remove: ['b'] })).toEqual({ next: [undefined], changed: 0 });
    expect(tagChangesFor([{ a: '1' }], { set: { a: '1' }, remove: [] })).toEqual({ next: [undefined], changed: 0 });
  });

  it('gives an empty result for no features', () => {
    expect(tagChangesFor([], { set: { a: '1' }, remove: ['b'] })).toEqual({ next: [], changed: 0 });
  });
});

describe('tagChangesFor then combinedTags', () => {
  it('gives one for every set key and absence for every removed key (300 seeded cases)', () => {
    const keys = ['a', 'b', 'c', 'd'];
    const values = ['x', 'y', 'z'];

    for (let seed = 1; seed <= 300; seed++) {
      const random = seededRandom(seed);
      const pick = (n: number) => Math.floor(random() * n);

      const features: Record<string, string>[] = [];
      const count = 1 + pick(4);
      for (let i = 0; i < count; i++) {
        const tags: Record<string, string> = {};
        for (const key of keys) if (random() < 0.5) tags[key] = values[pick(values.length)] ?? 'x';
        features.push(tags);
      }

      const set: Record<string, string> = {};
      const remove: string[] = [];
      for (const key of keys) {
        if (random() < 0.3) set[key] = values[pick(values.length)] ?? 'x';
        else if (random() < 0.3) remove.push(key);
      }

      const result = tagChangesFor(features, { set, remove });
      const applied = features.map((tags, i) => result.next[i] ?? tags);
      const combined = combinedTags(applied);

      for (const [key, value] of Object.entries(set)) {
        expect(combined[key]).toEqual({ kind: 'one', value });
      }
      for (const key of remove) {
        if (!Object.hasOwn(set, key)) expect(Object.hasOwn(combined, key)).toBe(false);
      }
      expect(result.changed).toBe(result.next.filter((tags) => tags !== undefined).length);
    }
  });
});
