# Reverse and the sides in a key

A reference for discussing, confirming or proposing changes to how an editor reverses a way with side tags. Written
2026-11-27 after Tobias noticed that Reverse (V) in Maid Bicycle turned `cycleway:both:marking:left` into
`…:marking:right`. Decision: "Wir folgen Tilda".

Countries with right-hand traffic. Every example road is drawn northwards.

## 1. What the wiki says

Read on 2026-11-27, at Tobias's request. The quotes were checked word for word in a browser.

### The first side: relative to the drawn way (de facto)

[Key:cycleway](https://wiki.openstreetmap.org/wiki/Key:cycleway):

> The terms "right" and "left" are relative to the direction in which the way was drawn in the editor

[Forward & backward, left & right](https://wiki.openstreetmap.org/wiki/Forward_%26_backward,_left_%26_right) says the
same.

### The riding direction of a lane: relative to the drawn way, with defaults (de facto)

[Key:cycleway:right:oneway](https://wiki.openstreetmap.org/wiki/Key:cycleway:right:oneway): `yes` is the direction of
the way, `-1` is against it, `no` is both directions. "Adding implicit default values is unnecessary tagging." The
defaults are:

| Road                                  | `cycleway:right:oneway` | `cycleway:left:oneway` |
| ------------------------------------- | ----------------------- | ---------------------- |
| two-way (no `oneway` or `oneway=no`)  | `yes`                   | `-1`                   |
| `oneway=yes`                          | `yes`                   | `yes`                  |
| `oneway=-1`                           | `-1`                    | `-1`                   |

So every lane on a road has an **effective riding direction**: the explicit value, or else the default of its side.
In the usual case a lane rides with the traffic next to it.

### The second side: relative to the riding direction (only in a draft)

[Proposal:Separation](https://wiki.openstreetmap.org/wiki/Proposal:Separation), status "Draft (under way)" since 2020,
never voted on:

> As a prefix of separation, left and right refer to the direction in which a (cycle)way is used, if it's a oneway
> (e.g. separation:left: The left side of the way in traveling direction). If it's not a oneway, but the way is mapped
> separately, left and right refers to the direction of the OSM line feature. For bi-directional cycle path mapped on
> a highway feature (tagged with cycleway:left:oneway=no or cycleway:right:oneway=no), left and right refer to the
> direction of traffic in which the path would be used if it were a one-way path.

The last case, "the direction of traffic in which the path would be used if it were a one-way path", is the default of
its side from the table above. Put together:

| Where the second side is                                   | It is read in                                             |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| a one-way lane on a road (`cycleway:right:separation:left`) | the lane's effective riding direction                     |
| a two-way lane on a road (`cycleway:right:oneway=no`)       | the default riding direction of its side                  |
| a one-way way of its own (`separation:left` on `highway=cycleway`) | its riding direction                               |
| a two-way way of its own                                    | the drawn way                                             |

Other sources:

- [Melbourne Bike Lane Project](https://wiki.openstreetmap.org/wiki/Melbourne_Bike_Lane_Project) says the same for
  `buffer`: "in relation to the direction of travel, not the orientation of the way".
- The abandoned "Buffered bike lane" proposal said the opposite.
- The de facto page Key:cycleway:separation and the forum say nothing about a second side.
- No wiki page says what a reverse does to side tags.

The riding-direction reading is the only documented one, but it is only in a draft. It is also the only reading in
which `cycleway:both:separation:left` makes sense: in the riding direction, "left" is the carriageway side of both
lanes.

TILDA reads the tags this way. See the tilda-geo processing changelog for 2026-11, `e9dc145` of 2026-11-23: "the
second left/right … is read in the riding direction of the lane".

## 2. The rule for a reverse

A reverse keeps the real world. Lanes, kerbs and bollards stay where they are. The only thing a reverse may change is
the direction of traffic on a one-way way, and only if the editor reverses that way's traffic on purpose (below). From
that:

1. **The side of the road** (`cycleway:<side>`, `sidewalk:<side>`, `parking:<side>`) swaps, always.
2. **The riding direction of a lane** stays physically the same, unless the lane follows a road whose traffic was
   reversed. An explicit `cycleway:<side>:oneway` turns `yes` ↔ `-1` where the line flipped and the lane did not. A
   default needs nothing: after the side swap, it gives the same direction again.
3. **The second side** (`…:separation:left`, `marking`, `buffer`, `traffic_mode`) is tied to the riding direction. It
   swaps if and only if the riding direction was reversed physically. On a road with two-way traffic it never swaps.
4. **The left and right of a two-way way of its own** are tied to the line. They always swap.

The key question is whether a reverse reverses the traffic of a one-way way:

| Model                                                                  | `oneway=yes` of the way      | second side of its lanes, and of a one-way cycleway |
| ---------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| **iD's V**: "correcting a backwards oneway is the primary reason for reversing a way" (iD `reverse.ts`) | stays: the traffic reverses  | swaps                                               |
| **Redraw** (package `reverseTags`, iD with `reverseOneway`)            | turns to `-1`: the traffic stays | stays                                               |

On a road with two-way traffic both models give the same result: nothing reverses, so the second side stays.

## 3. What each system does (2026-11-27)

Sources:

- iD: `modules/actions/reverse.ts` at the commit pinned in `.reference/id`.
- Our fork: the iD Radnetz fork, branch `tilda-packages` at `4b9f151a`. Its V is iD's `reverse.ts` unchanged; it uses
  the package's `reverseTags` only to extract or merge sidepaths.
- Maid: `packages/model/src/actions/reverse.ts`, a port of iD, plus `red_turn`.
- Package: `reverseTags` of `@tilda-geo/bicycle-infrastructure-tagging` 0.9.1.
- TILDA processing: how it reads the tags; it never reverses.

✓ means right by section 2. ✗ means wrong.

| #   | Before V                                                                          | iD, our fork, Maid (same code)                                                              | Package `reverseTags`                                                | TILDA processing reads                       | Should be                                                                                                 |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A   | two-way road, `cycleway:both=lane`, `cycleway:both:marking:left=dashed_line`      | `…:marking:right` ✗                                                                         | `…:marking:right` ✗                                                  | riding direction                             | `cycleway:both:marking:left` (unchanged)                                                                  |
| B   | two-way road, `cycleway:left:oneway=-1`, `cycleway:right:oneway=yes` (redundant)  | `left=yes`, `right=-1` ✗: both lanes now ride against the traffic (our validation flags it) | `left=-1`, `right=yes` ✓                                             | effective direction                          | `left=-1`, `right=yes`, or drop both (defaults)                                                           |
| C   | two-way road, `cycleway:right:separation:left=bollard`                            | `cycleway:right:separation:right` ✗: the road side is not swapped                           | `cycleway:left:separation:right` ✗                                   | riding direction                             | `cycleway:left:separation:left`                                                                           |
| D   | two-way road, `cycleway:right:oneway=no`, `cycleway:right:separation:left=kerb`   | `cycleway:right:separation:right` ✗, `cycleway:left:oneway=no` ✓                            | `cycleway:left:separation:right` ✗                                   | default direction of the side                | `cycleway:left:oneway=no`, `cycleway:left:separation:left`                                                |
| E   | `oneway=yes`, `cycleway:right=lane`, `cycleway:right:separation:left=bollard`     | `oneway=yes` (iD model), `cycleway:right:separation:right` ✗: road side not swapped         | `oneway=-1`, `cycleway:left:separation:right` ✗: redraw keeps the direction | riding direction                     | iD model: `oneway=yes`, `cycleway:left:separation:right`. Redraw: `oneway=-1`, `cycleway:left:separation:left` |
| F   | `highway=cycleway`, `oneway=yes`, `separation:left=kerb`                          | `oneway=yes`, `separation:right` ✓ (iD model)                                               | `oneway=-1`, `separation:right` ✗                                    | riding direction                             | iD model: `separation:right`. Redraw: `separation:left`                                                   |
| G   | `highway=cycleway`, no oneway, `separation:left=kerb`                             | `separation:right` ✓                                                                        | `separation:right` ✓                                                 | the drawn way                                | `separation:right`                                                                                        |

## 4. Where the systems disagree

1. **iD, our fork and Maid swap only one side per key.** Key replacement stops at the first match, the trailing
   `:left$`. So `cycleway:right:separation:left` keeps `cycleway:right`, and the bollard moves to the other side of
   the road (C, D, E). This is wrong in every reading: a bug.
2. **iD, our fork and Maid keep explicit side `:oneway` values on a road with two-way traffic** (B). The lanes turn
   round and ride against the traffic next to them. iD's reason, a backwards oneway, does not apply on a two-way road:
   a bug.
3. **iD, our fork and Maid swap the second side on a road with two-way traffic** (A). By the riding-direction reading
   it must stay. The cause is that iD treats every `:left` the same way.
4. **The package turns the `oneway` values (redraw) and still swaps the second side** (A, C, D, E, F). That mixes the
   two models: a bug in `reverseTags`.
5. **TILDA processing** reads every case as section 1 says. It is the reference for the meaning.

The only real disagreement in meaning is the second side: the line (iD's flat rule) or the riding direction (the draft
proposal, Melbourne, TILDA). Points 1, 2 and 4 are bugs in any reading.

## 5. What should be done, and why

| System                 | Change                                                                                                                                                                                                                       | Why                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Package (tagging 0.9.2) | `reverseTags` follows section 2 in the redraw model: on a road side, swap only the side after the prefix; turn explicit side `:oneway` values; keep the second side; on a way of its own, keep the second side if it is one-way and swap it if it is two-way. Tests: rows A to G. | It decides the meaning for TILDA and is used by Maid and the fork.                                       |
| Maid                   | V keeps iD's model for the way's own `oneway`, and follows section 2 for the sides: swap every road side; turn side `:oneway` values unless the road's traffic was reversed; swap the second side only if the riding direction reversed (E, F); keep `red_turn`. Tests: rows A to G, both models. | Maid Bicycle must not turn lanes round or move bollards. It reads like TILDA.                           |
| Our fork               | The same change to its `reverse.ts`, made by a person in the fork's repository.                                                                                                                                              | The fork and Maid should agree.                                                                         |
| iD                     | Issue drafts in `docs/upstream/`: bug 1 (only one side per key) and bug 2 (lane `:oneway` on two-way roads). Point 3 needs the meaning settled first, in the wiki: Proposal:Separation is still a draft. | Bugs 1 and 2 hold in any reading; point 3 is a tagging question.                                         |
| Wiki                   | A person adds the second-side rule and the effect of a reverse to Key:cycleway:separation (de facto), with a link to this section.                                                                                         | Today the de facto page is silent, and only a draft defines the meaning.                                |

Nothing has been changed in the code yet (2026-11-27).
