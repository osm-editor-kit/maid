# Reverse and the sides in a key

Tobias, 2026-11-27: after Reverse (V) on a road in Maid Bicycle, `cycleway:both:marking:left` became
`…:marking:right`. Tobias reads the second left/right from the infrastructure's point of view, so a reverse must not
touch it. "We follow TILDA." This note compares what each system does today and recommends one rule for all of them.
Nothing is changed yet.

## What each system does (2026-11-27)

Sources:

- iD: `modules/actions/reverse.ts` at the pinned commit in `.reference/id`, `keyReplacements`.
- Our iD fork, Radnetz Berlin: the local checkout at 4b9f151a, branch `tilda-packages`. Its V is iD's
  `reverse.ts` unchanged; `reverseTags` of the package is used only when a sidepath is extracted or merged.
- Package: `reverseTags` of `@tilda-geo/bicycle-infrastructure-tagging` 0.9.1 (`src/sidepath/merge-tags.ts`).
- TILDA: tilda-geo processing, `processing/CHANGELOG.md` 2026-11 and `line_direction.lua`, since `e9dc145`
  (2026-11-23).
- Maid: `packages/model/src/actions/reverse.ts`, a port of iD.

The example road is drawn north, two-way, with a bike lane on each side.

| Tag before V                                                          | iD                                            | Our fork (V)    | Package `reverseTags`                    | TILDA reads it as                                                                                                                                | Maid now        |
| --------------------------------------------------------------------- | --------------------------------------------- | --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `cycleway:right=lane`                                                 | `cycleway:left`                               | as iD           | `cycleway:left`                          | the side of the road, in the way's direction                                                                                                     | as iD           |
| `cycleway:both:marking:left=dashed_line`                              | `…:marking:right`                             | as iD           | `…:marking:right`                        | in the **riding direction of the lane**: the left of the lane, which does not change when the road is reversed. Should stay `…:marking:left`.    | as iD           |
| `cycleway:right:separation:left=bollard`                              | `cycleway:right:separation:right` (**wrong in every reading**: only the last side swaps) | as iD | `cycleway:left:separation:right` | riding direction: should become `cycleway:left:separation:left`                                                                                  | as iD           |
| `cycleway:left:oneway=-1`, `cycleway:right:oneway=yes`                | keys swap, values stay: `left=yes`, `right=-1`; **both lanes now ride against the traffic** (our new validation flags it) | as iD | keys swap, values flip: `left=-1`, `right=yes` | the riding direction of each lane, relative to the way                                                                                           | as iD           |
| `separation:left=kerb` on a `highway=cycleway` of its own             | `separation:right`                            | as iD           | `separation:right`                       | the **way's direction** (for a way of its own; the processing checks `separation:right` on `oneway=-1`)                                          | as iD           |
| `oneway=yes` of the way itself                                        | stays `yes`: V turns the traffic round, as iD has always done | as iD | `-1`: the traffic stays where it is | the way's direction                                                                                                                              | as iD (`-1` only with Maid's `reverseOneway`) |

How Maid understands the tags today:

- Maid's own code has no rule of its own for the second left/right. It uses `@tilda-geo/bicycle-infrastructure` 0.6.1
  for the categories.
- That package does not have TILDA's riding-direction rule of 2026-11-23 yet: it has no `carriageway_side`. So Maid can
  still read the separation of a lane on the wrong side.

## The rule TILDA uses, written out

1. The first side, after the prefix (`cycleway:<side>`, `sidewalk:<side>`, `parking:<side>`), is relative to the way.
   It swaps on a reverse.
2. A second left/right under a road side (`cycleway:<side>:separation:left`, `…:marking:left`, `…:buffer:left`,
   `…:traffic_mode:left`) is relative to the lane's riding direction. It stays on a reverse. `both` covers both lanes
   with one value, which only makes sense in this reading: "left of the lane" is the carriageway side for both.
3. Left/right on a way of its own (`separation:left` on `highway=cycleway`, `sidewalk:left` on a road) is relative to
   the way. It swaps on a reverse.
4. `forward`/`backward` anywhere in the key swap, and so does a `:oneway` value of a side (`yes` ↔ `-1`). The lane keeps
   riding where it rode.

## What the wiki and the forum say (2026-11-27)

Tobias asked for this read of the wiki and the forum. A Haiku agent fetched 14 pages; the quote from
Proposal:Separation was then checked word for word in the browser.

- **The first side** (`cycleway:right`) is relative to the drawn way. This is settled: Key:cycleway says left and
  right "are relative to the direction in which the way was drawn"; so do "Forward & backward, left & right" and the
  forum (thread 97632).
- **The second side** is defined in one place only, [Proposal:Separation](https://wiki.openstreetmap.org/wiki/Proposal:Separation).
  Its status is "Draft (under way)" since 2020; it was never voted on. The quote, checked word for word:
  > As a prefix of separation, left and right refer to the direction in which a (cycle)way is used, if it's a oneway
  > (e.g. separation:left: The left side of the way in traveling direction). If it's not a oneway, but the way is
  > mapped separately, left and right refers to the direction of the OSM line feature. For bi-directional cycle path
  > mapped on a highway feature (tagged with cycleway:left:oneway=no or cycleway:right:oneway=no), left and right refer
  > to the direction of traffic in which the path would be used if it were a one-way path.
- [Melbourne Bike Lane Project](https://wiki.openstreetmap.org/wiki/Melbourne_Bike_Lane_Project) says the same for
  `buffer`: "in relation to the direction of travel, not the orientation of the way". The abandoned proposal
  "Buffered bike lane" said the opposite. The de facto page Key:cycleway:separation says nothing about a second side.
- No page says what a reverse does to the sides or to `cycleway:<side>:oneway`.

So TILDA's reading (b) is the one documented, but only in a draft. The de facto pages do not settle it.

## Is `oneway=-1` the key? Yes

Tobias's guess holds. With (b), the second side is tied to the riding direction, and the riding direction is carried
by the `oneway` value. What a reverse must do with the second side depends only on what it does with `oneway`:

| A reverse that…                                                                  | the riding direction | the second side (b)                     |
| -------------------------------------------------------------------------------- | -------------------- | --------------------------------------- |
| turns the `oneway` values (`yes` ↔ `-1`): "the line is drawn the other way" (package) | stays where it was   | **stays**                               |
| keeps the `oneway` values: "the traffic goes the other way" (iD's V)            | turns round          | swaps                                   |

- **iD** keeps the values, so in its own logic the swap of the second side is right for a one-way way of its own.
  On a road side it is wrong: it turns the lanes of a two-way road round, and they then ride against the traffic.
- **The package** turns the `oneway` values and also swaps the second side. That mixes the two rows, so it is wrong
  either way. This is the bug in `reverseTags`.
- Two cases do not depend on `oneway`:
  - A way of its own without oneway: its left and right are relative to the line, so they always swap.
  - A two-way lane on a road (`cycleway:<side>:oneway=no`): its left and right are relative to the traffic next to it,
    so they never swap.

## Recommendation

One rule for all four places, the one above:

- **Package** (`reverseTags`, tagging 0.9.2): it turns the `oneway` values, so the second side must stay. On a road
  side, swap only the side right after the prefix. On a way of its own, swap `separation:left` and its kin only when
  the way is not one-way. Add a test with the four example rows. Also port `carriageway_side` from the processing into
  `@tilda-geo/bicycle-infrastructure`, so the categories read the separation as the processing does.
- **Maid**: Reverse uses the same rule for the keys under a road side. Best is to take `reverseTags` from the package
  once 0.9.2 has it, for the side keys only, so Maid and TILDA cannot drift apart. Fix the two-sides bug and flip the
  `:oneway` values of the sides. The way's own `oneway` stays as iD does it (V turns the traffic round), unless
  Tobias wants otherwise.
- **Our fork**: the same change in its `reverse.ts`, or V calls the package's `reverseTags` for the side keys. It is
  a person's change in the fork's repository.
- **iD**: an issue draft in `docs/upstream/` for the two-sides bug (`cycleway:right:separation:left` → only the last
  side swaps). The riding-direction rule is a tagging question for the wiki and the community, and is not part of that
  draft.

Open question for Tobias: should Maid wait for package 0.9.2, or get the rule now with a test that checks it against
the package once 0.9.2 is out?
