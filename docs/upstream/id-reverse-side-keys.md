# iD issue drafts: Reverse and road side keys

For a person to file at https://github.com/openstreetmap/iD/issues. Background and the cases:
[../research/reverse-side-keys.md](../research/reverse-side-keys.md). Both bugs are fixed in Maid (`af09501`) and in
the iD Radnetz fork (`1643433`).

The question of what a second left/right means is not in these drafts. It needs the wiki first, see
[wiki-cycleway-separation-sides.md](wiki-cycleway-separation-sides.md).

---

## Issue 1: Reverse swaps only one side in a key with two sides

> Written by Claude Opus 5.5 (effort: medium) on behalf of @tordans.

**What happens.** `actionReverse` uses the first matching entry of `keyReplacements`, and `:left$` is checked before
`:left:`. A key with two sides therefore gets only its last side swapped:

| Before                                | After V (iD)                        | Expected                                                    |
| ------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `cycleway:right:separation:left=bollard` | `cycleway:right:separation:right=bollard` | `cycleway:left:…` — the lane is on the other side of the way now |
| `sidewalk:left:bicycle:right=yes`     | `sidewalk:left:bicycle:left=yes`    | `sidewalk:right:…`                                          |

The road side (`cycleway:right`) is relative to the direction of the way (Key:cycleway), so it must swap on every
reverse. At the moment the bollard moves to the other side of the road.

**Steps.** Draw a way northwards, tag `highway=residential`, `cycleway:right=lane`, `cycleway:right:separation:left=bollard`,
press V.

**Suggestion.** For keys that start with a road side (`cycleway`, `sidewalk`, `parking`, `shoulder` followed by
`:left`, `:right` or `:both`), always swap that side.

---

## Issue 2: Reverse turns the bike lanes of a two-way road against the traffic

> Written by Claude Opus 5.5 (effort: medium) on behalf of @tordans.

**What happens.** On a two-way road with `cycleway:left:oneway=-1` and `cycleway:right:oneway=yes`, V swaps the keys
and keeps the values. The result is `cycleway:left:oneway=yes` and `cycleway:right:oneway=-1`, so both lanes now ride
against the traffic next to them.

**Why it is wrong.** `actionReverse` keeps `oneway` on purpose: "We assume that correcting a backwards oneway is the
primary reason for reversing a way." A two-way road has no oneway to correct, and the street does not change. Per
[Key:cycleway:right:oneway](https://wiki.openstreetmap.org/wiki/Key:cycleway:right:oneway), `yes`/`-1` are relative to
the way, so they must turn (`yes` ↔ `-1`) when the way is reversed and its traffic is not.

**Suggestion.** Turn explicit `<prefix>:<side>:oneway` values when the way itself is not one-way, or when
`reverseOneway` is set. On a one-way road whose `oneway` V keeps, keep them as today: the lanes follow the reversed
traffic.
