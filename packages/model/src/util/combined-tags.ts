/**
 * Not in Rapid's model. Ported from iD's `utilCombinedTags` (modules/util/util.ts at iD commit 0194f3926),
 * in a typed form: a key is `one` (every feature has the same value) or `mixed` (the features differ),
 * not iD's string-or-array. Also the tags one change writes to several features (`tagChangesFor`).
 * Headless: no React, no DOM. See docs/research/multi-selection.md, 3.2.
 */

/**
 * One key over several features.
 * `one`: every feature has the key with this value.
 * `mixed`: the features differ. `values` are the distinct values, most frequent first, ties in first-seen order.
 * `missing` is true when at least one feature lacks the key.
 */
export type Combined =
  | { kind: 'one'; value: string }
  | { kind: 'mixed'; values: string[]; missing: boolean };

/** The combined tags of several features. A key that no feature has is absent from the record. */
export type CombinedTags = Readonly<Record<string, Combined>>;

/** iD's shape: a string, or an array of values where `undefined` stands for a feature that lacks the key. */
export type CombinedIdTags = Readonly<Record<string, string | (string | undefined)[]>>;

/** One change made in the inspector. `set` writes a key to every feature, `remove` deletes it where present. */
export type TagChange = {
  readonly set: Readonly<Record<string, string>>;
  readonly remove: readonly string[];
};

/**
 * The result of a change: `next[i]` is the new tags of feature i, or `undefined` when feature i does not change.
 * `changed` counts the features that change.
 */
export type TagChangeResult = {
  readonly next: readonly (Record<string, string> | undefined)[];
  readonly changed: number;
};

/**
 * The value of a key on one feature, or `undefined`. Only own keys count, so `constructor` is not read
 * from the prototype.
 * @param   tags - The tags of one feature
 * @param   key  - The key
 * @return  The value, or `undefined` when the feature lacks the key
 */
function valueOf(tags: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(tags, key) ? tags[key] : undefined;
}

/**
 * The combined tags of several features, as iD's `utilCombinedTags` gives them, in the typed form.
 * For one feature every key is `one`. For none, the empty record.
 * @param   tagsOfEach - The tags of each feature, in selection order
 * @return  Per key over the union of all features' keys
 */
export function combinedTags(tagsOfEach: readonly Readonly<Record<string, string>>[]): CombinedTags {
  const keys = new Set<string>();
  for (const tags of tagsOfEach) {
    // iD drops empty keys too (`filter(Boolean)`).
    for (const key of Object.keys(tags)) if (key !== '') keys.add(key);
  }

  const entries: [string, Combined][] = [];
  for (const key of keys) {
    // A Map keeps insertion order, so equal counts stay in first-seen order below.
    const counts = new Map<string, number>();
    let missing = false;
    for (const tags of tagsOfEach) {
      const value = valueOf(tags, key);
      if (value === undefined) missing = true;
      else counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    // Array.prototype.sort is stable: equal counts keep first-seen order.
    const ranked = [...counts].sort(([, a], [, b]) => b - a);
    const first = ranked[0];
    if (!first) continue; // no feature has a value for it

    if (ranked.length === 1 && !missing) entries.push([key, { kind: 'one', value: first[0] }]);
    else entries.push([key, { kind: 'mixed', values: ranked.map(([value]) => value), missing }]);
  }
  return Object.fromEntries(entries);
}

/**
 * The combined tags in iD's shape, so that iD's tests can be adopted against them. A `one` key is its
 * string; a `mixed` key is its values, then `undefined` when some feature lacks the key.
 *
 * Order: values keep the typed order (most frequent first, ties first-seen), and `undefined` comes last.
 * iD differs in two ways that this cannot reproduce, because the typed form keeps no counts: iD breaks
 * ties alphabetically, and iD counts the features that lack a key as one more value, so `undefined` can
 * come first when more features lack the key than any one value has. Adopted tests pass as long as they
 * do not hit those cases.
 * @param   combined - The combined tags from `combinedTags`
 * @return  iD's shape, one entry per key
 */
export function combinedToId(combined: CombinedTags): CombinedIdTags {
  const entries = Object.entries(combined).map(
    ([key, value]): [string, string | (string | undefined)[]] =>
      value.kind === 'one'
        ? [key, value.value]
        : [key, [...value.values, ...(value.missing ? [undefined] : [])]],
  );
  return Object.fromEntries(entries);
}

/**
 * The tags of one feature after a change, or `undefined` when the change leaves it as it is.
 * A key in both `set` and `remove` is set.
 * @param   tags   - The tags of one feature
 * @param   change - The change
 * @return  The new tags, or `undefined` when nothing changes
 */
function nextTags(
  tags: Readonly<Record<string, string>>,
  change: TagChange,
): Record<string, string> | undefined {
  const current = new Map(Object.entries(tags));
  const result = new Map(current);
  for (const key of change.remove) result.delete(key);
  for (const [key, value] of Object.entries(change.set)) result.set(key, value);

  const changed =
    result.size !== current.size || [...result].some(([key, value]) => current.get(key) !== value);
  return changed ? Object.fromEntries(result) : undefined;
}

/**
 * What one change does to each feature. `set` writes the key to every feature; a feature that already has
 * the value does not change. `remove` deletes the key from each feature that has it. Keys and values are
 * taken as given: cleaning them is the caller's job. A rename is a remove plus a set.
 * @param   tagsOfEach - The tags of each feature, in selection order
 * @param   change     - The change made in the inspector
 * @return  The next tags per feature (or `undefined`), and how many features change
 */
export function tagChangesFor(
  tagsOfEach: readonly Readonly<Record<string, string>>[],
  change: TagChange,
): TagChangeResult {
  const next = tagsOfEach.map((tags) => nextTags(tags, change));
  return { next, changed: next.filter((tags) => tags !== undefined).length };
}
