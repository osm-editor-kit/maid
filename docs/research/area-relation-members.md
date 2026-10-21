# Area relations: are the members tagged?

Research note for the inspector question: Maid shows route-like relations (bus, bicycle, hiking) in a column beside the inspector. Do multipolygon and building relations need the same? How often do their outer and inner members carry their own tags, and which tags?

Measured offline on two local extracts (no network requests):

- Berlin: `berlin-latest.osm.pbf`, Geofabrik replication timestamp 2026-08-06T20:21:21Z, latest object 2026-08-06T20:19:16Z.
- Germany: `germany-latest.osm.pbf`, replication timestamp 2026-08-31T20:21:20Z, latest object 2026-08-31T20:21:09Z.

Every number below is measured on the extract named in its column. The "What this means" section is inferred and marked as such.

## Summary

- **Building multipolygons (`type=multipolygon` with `building=*`) are mostly plain geometry.** 91.1% of member entries in Berlin (2,612 relations) and 89.5% in Germany (26,297 relations) carry no tags. 85.1% (Berlin) and 82.6% (Germany) of the relations have no tagged member at all. Only 4.5% (Berlin) and 7.7% (Germany) of member entries carry a tag beyond the noise keys.
- **Duplicated tags are rare; own features are the tagged case.** Members that repeat the relation's tags (class a) are 0.2% (Berlin) and 0.5% (Germany) of entries. Own features (class b: a feature key the relation lacks, or has with another value) are 3.0% and 5.0% of entries, on 4.8% and 8.0% of the building relations. Typical keys: `building:part`, `building`, `leisure`, `landuse`, `amenity`, `man_made`, `parking`, `barrier`.
- **Other multipolygons (landuse, natural, leisure, water, ...) are where member tags matter.** 45.3% (Berlin, 2,299 relations) and 50.9% (Germany, 237,810 relations) of member entries are tagged, almost all as own features (`natural`, `landuse`, `barrier`, `railway`, `water`). 64.1% and 74.0% of these relations have at least one tagged member.
- **`type=building` relations are tag-heavy in their members.** 97.5% (Berlin, 887 relations) and 97.3% (Germany, 12,409) of member entries are tagged, mostly `building:part=yes` ways with `building:levels`, `height`, `min_height` and roof tags, in role `part`. IndoorOSM leftovers are a small share: 1,717 Germany entries (2.4%) carry `level`, 779 `indoor`, 641 `door`, 165 `room`. The Germany extract also has 1,004 relation members (840 of them `type=multipolygon`, 108 `type=level`).
- **Multipolygons with `building:part=*` but no `building=*` (kind B: 220 and 2,078 relations) are mixed.** 27.8% (Berlin) and 14.2% (Germany) of their entries are tagged. In Berlin 18.9% are "other" (member and relation disagree on a non-feature key such as `building:levels` or `height`); in Germany 5.3%.

## Method

Commands, run in a scratch folder outside the repository (the analysis script was not kept):

```sh
osmium fileinfo -e berlin-latest.osm.pbf                  # extract dates and counts
osmium fileinfo -e germany-latest.osm.pbf
osmium tags-filter --no-progress -O -o b_mp.osm.pbf berlin-latest.osm.pbf r/type=multipolygon r/type=building
osmium cat --no-progress -O -f opl -o b_mp.opl b_mp.osm.pbf
python3 -I analyze.py b_mp.opl b_results.json berlin
osmium tags-filter --no-progress -O -o g_mp.osm.pbf germany-latest.osm.pbf r/type=multipolygon r/type=building
osmium cat --no-progress -O -f opl -o g_mp.opl g_mp.osm.pbf
python3 -I analyze.py g_mp.opl g_results.json germany
python3 -I gen_tables.py                                  # tables for this note
```

The Germany filter took about one minute (output 230 MB), well under the 15-minute limit, so both extracts are complete. `tags-filter` adds the referenced objects (member ways, member nodes and member relations of the matched relations); the scripts then make two passes over the OPL text: relations first, then the tags of the member nodes and ways.

Definitions:

- **Kinds of relation**: A = `type=multipolygon` with `building=*`; B = `type=multipolygon` with `building:part=*` and no `building=*`; C = all other `type=multipolygon`; D = `type=building`.
- **Member entry**: one membership of a way, node or relation in a relation. A way that is a member of two relations counts twice; distinct ways are reported separately. Shares use present entries (memberships minus members absent from the extract) as the denominator.
- **Noise keys** (not counted as member data): `created_by`, `note`, `fixme`, `FIXME`, `attribution`, and any key starting with `source` or `check_date`.
- **Classes** (member tags compared with the relation's tags, noise removed):
  - untagged: no tags at all;
  - c noise only: only noise keys;
  - a duplicate of relation: every non-noise member tag appears identically on the relation;
  - b own feature: a non-noise member key is in the feature list (building, building:part, barrier, highway, waterway, landuse, natural, leisure, amenity, man_made, railway, aeroway, power, place, water, indoor, room, level, entrance, and similar) and the relation lacks it or has another value;
  - d other: the members differ only in non-feature keys (name, ref, surface, addresses, roof and height tags, `building:levels` on a building multipolygon, ...).
  - One rule changed during the run. The first version put a feature key with another value on the relation into d. For Germany kind C this put inner rings such as `landuse=farmland` inside a `landuse=forest` relation in "other", which is an own feature; the rule now counts them as b. The Q3 reasons tables show what remains in d. The earlier counts are noted in the open questions.
- **Escapes**: the OPL export writes a space as `%20%`; the script restores the space and changes nothing else.
- **Missing**: member ways absent from the extract: Berlin 11 of 20,308 distinct ways, Germany 1,831 of 1,018,717. Counted separately and excluded from shares.
- **Top-30 lists** count key and key=value occurrences over member entries with tags beyond noise, per entry (a key on two members counts twice).

## Q1. Relations by kind

Matched relations: Berlin 6,018 (of 6,033 relations in the filtered file; the other 15 are `type=level` members of `type=building` relations). Germany 278,594 (of 278,739).

| Kind                                  | Berlin relations | Berlin share | Germany relations | Germany share |
| ------------------------------------- | ---------------: | -----------: | ----------------: | ------------: |
| A: MP building=*                      |            2,612 |        43.4% |            26,297 |          9.4% |
| B: MP building:part=* (no building=*) |              220 |         3.7% |             2,078 |          0.7% |
| C: MP other                           |            2,299 |        38.2% |           237,810 |         85.4% |
| D: type=building                      |              887 |        14.7% |            12,409 |          4.5% |
| Total (matched)                       |            6,018 |         100% |           278,594 |          100% |

Top 10 keys on kind C relations (relations carrying the key; meta keys `type`, `name`, `source`, `wikidata`, `wikipedia`, `note`, `fixme`, `created_by`, `attribution`, `check_date`, `ref` and `description` excluded). Berlin: 2,299 relations, none without a non-meta key. Germany: 237,810 relations, 258 without a non-meta key.

| Rank | Berlin key         | Relations | Germany key  | Relations |
| ---: | ------------------ | --------: | ------------ | --------: |
|    1 | `landuse`          |       753 | `landuse`    |   148,255 |
|    2 | `surface`          |       428 | `natural`    |    59,346 |
|    3 | `lit`              |       368 | `leaf_type`  |    10,330 |
|    4 | `natural`          |       366 | `leisure`    |     9,553 |
|    5 | `leisure`          |       352 | `surface`    |     8,430 |
|    6 | `area`             |       318 | `amenity`    |     5,926 |
|    7 | `wheelchair`       |       290 | `water`      |     5,866 |
|    8 | `level`            |       253 | `leaf_cycle` |     5,187 |
|    9 | `railway`          |       253 | `access`     |     4,994 |
|   10 | `public_transport` |       253 | `operator`   |     4,661 |

## Q2. Member ways: roles, tags, top keys

### Kind A: multipolygon with `building=*`

| Measure                                                         |               Berlin |                  Germany |
| --------------------------------------------------------------- | -------------------: | -----------------------: |
| Relations                                                       |                2,612 |                   26,297 |
| Member entries (ways / nodes / relations)                       | 6,278 (6274 / 4 / 0) | 64,476 (64419 / 25 / 32) |
| Missing from extract                                            |                    2 |                       13 |
| Entries with any tag                                            |           557 (8.9%) |            6,740 (10.5%) |
| Entries with a tag beyond noise keys                            |           285 (4.5%) |             4,995 (7.7%) |
| Relations with >=1 tagged member                                |          390 (14.9%) |            4,569 (17.4%) |
| Relations with >=1 own-feature member (class b)                 |           125 (4.8%) |             2,107 (8.0%) |
| Relations with no tagged member (all members are untagged ways) |        2,222 (85.1%) |           21,722 (82.6%) |
| Distinct member ways / ways in more than one membership         |           6,255 / 17 |           63,305 / 1,072 |

Roles, with classes (untagged / b / a / d / c):

| Role              | Berlin n | Berlin untagged / b / a / d / c | Germany n | Germany untagged / b / a / d / c     |
| ----------------- | -------: | ------------------------------- | --------: | ------------------------------------ |
| `inner`           |    3,288 | 3,029 / 136 / 2 / 25 / 94       |    28,380 | 24,940 / 2,153 / 95 / 459 / 718      |
| `outer`           |    2,987 | 2,690 / 53 / 9 / 57 / 178       |    36,053 | 32,741 / 1,034 / 223 / 1,004 / 1,027 |
| `subarea`         |        1 | 0 / 0 / 0 / 1 / 0               |         1 | 0 / 0 / 0 / 1 / 0                    |
| `entrance / exit` |        1 | 0 / 1 / 0 / 0 / 0               |         3 | 0 / 3 / 0 / 0 / 0                    |
| `contains`        |        1 | 0 / 1 / 0 / 0 / 0               |         1 | 0 / 1 / 0 / 0 / 0                    |
| `(empty)`         |        0 | 0 / 0 / 0 / 0 / 0               |        23 | 10 / 8 / 1 / 4 / 0                   |
| `member`          |        0 | 0 / 0 / 0 / 0 / 0               |         6 | 0 / 4 / 0 / 1 / 0                    |
| `part`            |        0 | 0 / 0 / 0 / 0 / 0               |         3 | 0 / 0 / 0 / 0 / 0                    |

Top 30 keys on tagged member entries (noise excluded):

|   # | Berlin key          |   n | Germany key        |     n |
| --: | ------------------- | --: | ------------------ | ----: |
|   1 | `building`          |  62 | `addr:street`      | 1,043 |
|   2 | `building:levels`   |  61 | `addr:city`        | 1,042 |
|   3 | `building:part`     |  49 | `addr:housenumber` | 1,016 |
|   4 | `roof:shape`        |  39 | `addr:postcode`    |   988 |
|   5 | `addr:street`       |  35 | `building`         |   870 |
|   6 | `name`              |  34 | `addr:country`     |   779 |
|   7 | `addr:housenumber`  |  33 | `name`             |   646 |
|   8 | `addr:city`         |  32 | `leisure`          |   606 |
|   9 | `addr:postcode`     |  31 | `landuse`          |   539 |
|  10 | `landuse`           |  27 | `building:levels`  |   484 |
|  11 | `addr:country`      |  26 | `area`             |   465 |
|  12 | `area`              |  26 | `building:part`    |   450 |
|  13 | `access`            |  24 | `man_made`         |   391 |
|  14 | `heritage`          |  24 | `roof:shape`       |   388 |
|  15 | `heritage:operator` |  24 | `height`           |   278 |
|  16 | `addr:suburb`       |  23 | `barrier`          |   249 |
|  17 | `lda:criteria`      |  23 | `amenity`          |   237 |
|  18 | `ref:lda`           |  23 | `wheelchair`       |   237 |
|  19 | `leisure`           |  22 | `access`           |   188 |
|  20 | `amenity`           |  18 | `roof:colour`      |   187 |
|  21 | `man_made`          |  17 | `addr:suburb`      |   179 |
|  22 | `layer`             |  11 | `surface`          |   155 |
|  23 | `parking`           |  10 | `website`          |   149 |
|  24 | `height`            |  10 | `operator`         |   147 |
|  25 | `wheelchair`        |  10 | `roof:levels`      |   144 |
|  26 | `roof:levels`       |  10 | `highway`          |   143 |
|  27 | `website`           |   8 | `fence_type`       |   134 |
|  28 | `ref`               |   8 | `description`      |   132 |
|  29 | `roof:colour`       |   8 | `fence:colour`     |   132 |
|  30 | `wikidata`          |   7 | `building:colour`  |   128 |

Top 30 key=value pairs:

|   # | Berlin key=value            |   n | Germany key=value          |   n |
| --: | --------------------------- | --: | -------------------------- | --: |
|   1 | `building:part=yes`         |  33 | `addr:country=DE`          | 779 |
|   2 | `roof:shape=flat`           |  33 | `area=yes`                 | 464 |
|   3 | `addr:city=Berlin`          |  32 | `building=yes`             | 419 |
|   4 | `addr:country=DE`           |  26 | `landuse=grass`            | 382 |
|   5 | `area=yes`                  |  26 | `leisure=garden`           | 364 |
|   6 | `landuse=grass`             |  26 | `building:part=yes`        | 308 |
|   7 | `building=yes`              |  26 | `man_made=courtyard`       | 288 |
|   8 | `heritage=4`                |  24 | `roof:shape=flat`          | 204 |
|   9 | `heritage:operator=lda`     |  24 | `barrier=fence`            | 167 |
|  10 | `building:levels=1`         |  19 | `wheelchair=yes`           | 161 |
|  11 | `access=private`            |  18 | `building:levels=1`        | 151 |
|  12 | `leisure=garden`            |  17 | `fence:colour=gray`        | 132 |
|  13 | `man_made=courtyard`        |  17 | `fence_type=metal`         | 132 |
|  14 | `lda:criteria=Baudenkmal`   |  12 | `access=private`           | 131 |
|  15 | `building:levels=3`         |  12 | `leisure=park`             | 123 |
|  16 | `amenity=parking`           |  11 | `building:levels=2`        | 109 |
|  17 | `lda:criteria=Ensembleteil` |  11 | `layer=1`                  | 100 |
|  18 | `building=retail`           |  10 | `addr:housenumber=1`       |  95 |
|  19 | `building:levels=2`         |  10 | `roof:shape=gabled`        |  89 |
|  20 | `parking=surface`           |   9 | `highway=pedestrian`       |  81 |
|  21 | `layer=1`                   |   9 | `building:levels=3`        |  75 |
|  22 | `roof:levels=0`             |   8 | `roof:levels=1`            |  67 |
|  23 | `wheelchair=yes`            |   7 | `building:part=apartments` |  66 |
|  24 | `building:part=commercial`  |   7 | `building:levels=4`        |  64 |
|  25 | `building=apartments`       |   7 | `building=roof`            |  63 |
|  26 | `building=industrial`       |   6 | `building=school`          |  63 |
|  27 | `building:part=apartments`  |   5 | `roof:levels=0`            |  59 |
|  28 | `roof:colour=gray`          |   5 | `addr:housenumber=2`       |  58 |
|  29 | `building:levels=4`         |   5 | `building=industrial`      |  54 |
|  30 | `building:levels=10`        |   5 | `amenity=school`           |  52 |

### Kind B: multipolygon with `building:part=*`, no `building=*`

| Measure                                                         |            Berlin |              Germany |
| --------------------------------------------------------------- | ----------------: | -------------------: |
| Relations                                                       |               220 |                2,078 |
| Member entries (ways / nodes / relations)                       | 625 (625 / 0 / 0) | 9,411 (9408 / 1 / 2) |
| Missing from extract                                            |                 0 |                    0 |
| Entries with any tag                                            |       174 (27.8%) |        1,332 (14.2%) |
| Entries with a tag beyond noise keys                            |       174 (27.8%) |        1,247 (13.3%) |
| Relations with >=1 tagged member                                |       103 (46.8%) |          749 (36.0%) |
| Relations with >=1 own-feature member (class b)                 |        34 (15.5%) |          374 (18.0%) |
| Relations with no tagged member (all members are untagged ways) |       117 (53.2%) |        1,327 (63.9%) |
| Distinct member ways / ways in more than one membership         |          574 / 50 |        6,859 / 1,800 |

| Role           | Berlin n | Berlin untagged / b / a / d / c | Germany n | Germany untagged / b / a / d / c |
| -------------- | -------: | ------------------------------- | --------: | -------------------------------- |
| `outer`        |      370 | 337 / 15 / 1 / 17 / 0           |     7,574 | 6,995 / 420 / 28 / 76 / 54       |
| `inner`        |      253 | 114 / 35 / 5 / 99 / 0           |     1,834 | 1,082 / 248 / 55 / 417 / 31      |
| `part`         |        2 | 0 / 0 / 0 / 2 / 0               |         2 | 0 / 0 / 0 / 2 / 0                |
| `vehicle_gate` |        0 | 0 / 0 / 0 / 0 / 0               |         1 | 0 / 1 / 0 / 0 / 0                |

|   # | Berlin key           |   n | Germany key         |   n |
| --: | -------------------- | --: | ------------------- | --: |
|   1 | `building:part`      | 137 | `building:part`     | 624 |
|   2 | `building:levels`    | 123 | `height`            | 452 |
|   3 | `roof:shape`         |  34 | `building:levels`   | 426 |
|   4 | `height`             |  33 | `roof:shape`        | 322 |
|   5 | `roof:colour`        |  20 | `barrier`           | 225 |
|   6 | `building`           |  13 | `fence_type`        | 211 |
|   7 | `building:material`  |  10 | `fence:colour`      | 204 |
|   8 | `roof:height`        |  10 | `level`             | 185 |
|   9 | `roof:material`      |  10 | `roof:material`     | 172 |
|  10 | `building:colour`    |   9 | `min_height`        | 160 |
|  11 | `area`               |   5 | `roof:colour`       | 141 |
|  12 | `addr:housenumber`   |   4 | `name`              | 137 |
|  13 | `addr:street`        |   4 | `building`          | 118 |
|  14 | `building:min_level` |   4 | `ref`               | 108 |
|  15 | `min_height`         |   4 | `railway`           | 106 |
|  16 | `roof:direction`     |   4 | `building:material` | 104 |
|  17 | `addr:city`          |   3 | `description`       |  99 |
|  18 | `addr:country`       |   3 | `building:colour`   |  99 |
|  19 | `addr:postcode`      |   3 | `layer`             |  85 |
|  20 | `addr:suburb`        |   3 | `ref:IFOPT`         |  80 |
|  21 | `start_date`         |   3 | `bench`             |  72 |
|  22 | `roof:levels`        |   3 | `public_transport`  |  72 |
|  23 | `wheelchair`         |   3 | `subway`            |  70 |
|  24 | `basin`              |   3 | `tactile_paving`    |  70 |
|  25 | `natural`            |   3 | `addr:street`       |  68 |
|  26 | `water`              |   3 | `bin`               |  66 |
|  27 | `opening_date`       |   3 | `addr:housenumber`  |  65 |
|  28 | `name`               |   2 | `addr:city`         |  65 |
|  29 | `wikidata`           |   2 | `indoor`            |  65 |
|  30 | `layer`              |   2 | `addr:postcode`     |  64 |

|   # | Berlin key=value           |   n | Germany key=value           |   n |
| --: | -------------------------- | --: | --------------------------- | --: |
|   1 | `building:part=yes`        |  98 | `building:part=yes`         | 475 |
|   2 | `building:levels=1`        |  20 | `barrier=fence`             | 217 |
|   3 | `roof:shape=flat`          |  20 | `roof:shape=flat`           | 210 |
|   4 | `building:levels=7`        |  18 | `fence:colour=gray`         | 204 |
|   5 | `building:levels=5`        |  16 | `fence_type=metal`          | 204 |
|   6 | `building:levels=4`        |  15 | `building:levels=1`         |  88 |
|   7 | `building:levels=3`        |  13 | `roof:material=glass`       |  83 |
|   8 | `building:part=retail`     |  11 | `bench=yes`                 |  72 |
|   9 | `building:levels=10`       |  11 | `public_transport=platform` |  72 |
|  10 | `building:part=commercial` |  10 | `railway=platform`          |  72 |
|  11 | `roof:colour=gray`         |  10 | `subway=yes`                |  70 |
|  12 | `building:levels=2`        |   9 | `tactile_paving=yes`        |  69 |
|  13 | `roof:material=glass`      |   8 | `building:levels=4`         |  65 |
|  14 | `building:part=roof`       |   7 | `bin=yes`                   |  65 |
|  15 | `building:colour=#8B9E8B`  |   6 | `height=1`                  |  62 |
|  16 | `building:material=glass`  |   5 | `building:levels=3`         |  59 |
|  17 | `building:levels=8`        |   5 | `building:levels=2`         |  58 |
|  18 | `roof:shape=pyramidal`     |   5 | `indoor=yes`                |  55 |
|  19 | `building:levels=9`        |   5 | `level=-2`                  |  55 |
|  20 | `roof:shape=skillion`      |   5 | `building:levels=5`         |  53 |
|  21 | `roof:colour=#63665E`      |   5 | `building:part=elevator`    |  48 |
|  22 | `area=yes`                 |   5 | `building:part=roof`        |  46 |
|  23 | `roof:shape=dome`          |   4 | `addr:country=DE`           |  43 |
|  24 | `building:part=apartments` |   4 | `ref=1`                     |  42 |
|  25 | `building:levels=6`        |   4 | `ref=2`                     |  42 |
|  26 | `height=25`                |   4 | `wheelchair=yes`            |  41 |
|  27 | `building=yes`             |   4 | `lit=yes`                   |  41 |
|  28 | `height=22`                |   4 | `roof:shape=pyramidal`      |  41 |
|  29 | `addr:city=Berlin`         |   3 | `area=yes`                  |  41 |
|  30 | `addr:country=DE`          |   3 | `level=-1`                  |  37 |

### Kind C: other multipolygons

| Measure                                                         |                Berlin |                      Germany |
| --------------------------------------------------------------- | --------------------: | ---------------------------: |
| Relations                                                       |                 2,299 |                      237,810 |
| Member entries (ways / nodes / relations)                       | 8,297 (8257 / 38 / 2) | 993,133 (992770 / 208 / 155) |
| Missing from extract                                            |                     9 |                        2,534 |
| Entries with any tag                                            |         3,762 (45.4%) |              505,755 (51.1%) |
| Entries with a tag beyond noise keys                            |         3,740 (45.1%) |              485,282 (49.0%) |
| Relations with >=1 tagged member                                |         1,474 (64.1%) |              175,991 (74.0%) |
| Relations with >=1 own-feature member (class b)                 |         1,420 (61.8%) |              170,028 (71.5%) |
| Relations with no tagged member (all members are untagged ways) |           825 (35.9%) |               61,772 (26.0%) |
| Distinct member ways / ways in more than one membership         |           7,720 / 509 |             887,327 / 99,770 |

| Role       | Berlin n | Berlin untagged / b / a / d / c | Germany n | Germany untagged / b / a / d / c          |
| ---------- | -------: | ------------------------------- | --------: | ----------------------------------------- |
| `outer`    |    4,695 | 3,626 / 954 / 16 / 73 / 20      |   504,710 | 429,129 / 50,059 / 2,513 / 2,893 / 17,802 |
| `inner`    |    3,564 | 898 / 2,553 / 26 / 81 / 2       |   488,249 | 55,525 / 425,377 / 563 / 3,776 / 2,670    |
| `stop`     |       34 | 0 / 34 / 0 / 0 / 0              |        33 | 0 / 33 / 0 / 0 / 0                        |
| `label`    |        2 | 0 / 2 / 0 / 0 / 0               |        10 | 2 / 5 / 1 / 2 / 0                         |
| `member`   |        1 | 0 / 0 / 0 / 1 / 0               |         2 | 0 / 0 / 0 / 1 / 0                         |
| `platform` |        1 | 0 / 0 / 0 / 0 / 0               |         0 | 0 / 0 / 0 / 0 / 0                         |
| `(empty)`  |        0 | 0 / 0 / 0 / 0 / 0               |        75 | 28 / 37 / 2 / 6 / 1                       |
| `subarea`  |        0 | 0 / 0 / 0 / 0 / 0               |        34 | 0 / 0 / 0 / 0 / 0                         |

|   # | Berlin key          |   n | Germany key        |       n |
| --: | ------------------- | --: | ------------------ | ------: |
|   1 | `natural`           | 908 | `natural`          | 222,451 |
|   2 | `landuse`           | 827 | `landuse`          | 178,008 |
|   3 | `name`              | 642 | `water`            |  36,863 |
|   4 | `barrier`           | 574 | `name`             |  32,103 |
|   5 | `railway`           | 479 | `barrier`          |  19,355 |
|   6 | `ref`               | 451 | `surface`          |  18,979 |
|   7 | `ref:IFOPT`         | 389 | `highway`          |  18,876 |
|   8 | `leisure`           | 256 | `leaf_type`        |  13,327 |
|   9 | `surface`           | 218 | `leisure`          |  13,120 |
|  10 | `amenity`           | 208 | `man_made`         |   8,726 |
|  11 | `water`             | 201 | `crop`             |   8,297 |
|  12 | `wikidata`          | 186 | `building`         |   7,844 |
|  13 | `building`          | 169 | `amenity`          |   7,745 |
|  14 | `access`            | 164 | `tracktype`        |   7,719 |
|  15 | `lit`               | 140 | `wetland`          |   7,481 |
|  16 | `leaf_type`         | 135 | `sport`            |   7,311 |
|  17 | `wheelchair`        | 129 | `lit`              |   6,850 |
|  18 | `level`             | 126 | `access`           |   6,456 |
|  19 | `wikimedia_commons` | 114 | `ref`              |   6,123 |
|  20 | `building:levels`   | 114 | `boundary`         |   5,702 |
|  21 | `place`             | 113 | `place`            |   5,200 |
|  22 | `height`            | 111 | `leaf_cycle`       |   4,593 |
|  23 | `sport`             | 107 | `description`      |   3,989 |
|  24 | `man_made`          |  95 | `addr:street`      |   3,856 |
|  25 | `description`       |  94 | `addr:city`        |   3,829 |
|  26 | `fee`               |  92 | `height`           |   3,825 |
|  27 | `addr:street`       |  91 | `addr:postcode`    |   3,774 |
|  28 | `website`           |  90 | `addr:housenumber` |   3,669 |
|  29 | `wikipedia`         |  89 | `wikidata`         |   3,493 |
|  30 | `addr:city`         |  88 | `parking`          |   3,449 |

|   # | Berlin key=value        |   n | Germany key=value       |      n |
| --: | ----------------------- | --: | ----------------------- | -----: |
|   1 | `railway=platform_edge` | 442 | `natural=water`         | 97,575 |
|   2 | `natural=water`         | 397 | `natural=scrub`         | 62,132 |
|   3 | `landuse=grass`         | 303 | `landuse=meadow`        | 58,994 |
|   4 | `barrier=fence`         | 286 | `landuse=forest`        | 37,652 |
|   5 | `barrier=kerb`          | 153 | `water=pond`            | 29,135 |
|   6 | `natural=scrub`         | 142 | `landuse=farmland`      | 22,684 |
|   7 | `natural=wood`          | 140 | `natural=wood`          | 20,458 |
|   8 | `ref=1`                 | 135 | `landuse=grass`         | 19,151 |
|   9 | `ref=2`                 | 131 | `barrier=fence`         | 11,844 |
|  10 | `water=pond`            | 129 | `natural=grassland`     | 11,752 |
|  11 | `natural=wetland`       | 110 | `landuse=residential`   | 11,413 |
|  12 | `landuse=meadow`        | 105 | `highway=track`         | 11,172 |
|  13 | `place=islet`           | 104 | `natural=wetland`       | 10,656 |
|  14 | `leaf_type=broadleaved` | 104 | `natural=bare_rock`     |  9,546 |
|  15 | `access=yes`            |  94 | `leaf_type=broadleaved` |  9,491 |
|  16 | `addr:city=Berlin`      |  87 | `crop=hop`              |  6,852 |
|  17 | `lit=yes`               |  86 | `landuse=farmyard`      |  6,575 |
|  18 | `wheelchair=yes`        |  80 | `man_made=clearcut`     |  6,173 |
|  19 | `amenity=parking`       |  79 | `leisure=pitch`         |  6,080 |
|  20 | `fee=no`                |  77 | `surface=asphalt`       |  5,777 |
|  21 | `barrier=wall`          |  76 | `place=islet`           |  4,221 |
|  22 | `leisure=pitch`         |  73 | `amenity=parking`       |  4,030 |
|  23 | `indoor=wall`           |  72 | `surface=grass`         |  3,600 |
|  24 | `landuse=forest`        |  70 | `leaf_cycle=deciduous`  |  3,593 |
|  25 | `landuse=residential`   |  70 | `landuse=orchard`       |  3,524 |
|  26 | `addr:country=DE`       |  67 | `lit=no`                |  3,521 |
|  27 | `roof:shape=flat`       |  65 | `building=yes`          |  3,392 |
|  28 | `landuse=flowerbed`     |  63 | `access=yes`            |  3,383 |
|  29 | `landuse=commercial`    |  60 | `lit=yes`               |  3,314 |
|  30 | `leisure=playground`    |  58 | `railway=platform_edge` |  3,272 |

### Kind D: `type=building`

| Measure                                                         |                   Berlin |                      Germany |
| --------------------------------------------------------------- | -----------------------: | ---------------------------: |
| Relations                                                       |                      887 |                       12,409 |
| Member entries (ways / nodes / relations)                       | 6,775 (6095 / 563 / 117) | 70,331 (63580 / 5747 / 1004) |
| Missing from extract                                            |                        0 |                            0 |
| Entries with any tag                                            |            6,607 (97.5%) |               68,419 (97.3%) |
| Entries with a tag beyond noise keys                            |            6,606 (97.5%) |               68,368 (97.2%) |
| Relations with >=1 tagged member                                |              884 (99.7%) |               12,341 (99.5%) |
| Relations with >=1 own-feature member (class b)                 |              884 (99.7%) |               12,310 (99.2%) |
| Relations with no tagged member (all members are untagged ways) |                 0 (0.0%) |                     8 (0.1%) |
| Distinct member ways / ways in more than one membership         |               6,083 / 12 |                 63,402 / 177 |

| Role       | Berlin n | Berlin untagged / b / a / d / c | Germany n | Germany untagged / b / a / d / c |
| ---------- | -------: | ------------------------------- | --------: | -------------------------------- |
| `part`     |    3,454 | 26 / 3,397 / 0 / 3 / 0          |    41,906 | 93 / 41,200 / 5 / 110 / 0        |
| `(empty)`  |    2,512 | 2 / 2,052 / 0 / 450 / 0         |    10,541 | 572 / 9,324 / 5 / 566 / 33       |
| `outline`  |      620 | 18 / 497 / 15 / 20 / 1          |    10,986 | 157 / 9,271 / 181 / 1,035 / 7    |
| `entrance` |       87 | 0 / 87 / 0 / 0 / 0              |     1,716 | 16 / 1,697 / 0 / 3 / 0           |
| `ridge`    |       21 | 2 / 0 / 0 / 19 / 0              |       639 | 5 / 3 / 0 / 629 / 2              |
| `edge`     |       19 | 0 / 0 / 0 / 19 / 0              |       947 | 4 / 11 / 0 / 932 / 0             |
| `contains` |        6 | 1 / 5 / 0 / 0 / 0               |     2,487 | 26 / 2,329 / 0 / 113 / 3         |

|   # | Berlin key                    |     n | Germany key          |      n |
| --: | ----------------------------- | ----: | -------------------- | -----: |
|   1 | `building:part`               | 5,109 | `building:part`      | 47,964 |
|   2 | `building:levels`             | 4,557 | `roof:shape`         | 36,322 |
|   3 | `height`                      | 2,004 | `building:levels`    | 32,094 |
|   4 | `roof:shape`                  | 1,960 | `height`             | 28,772 |
|   5 | `building:colour`             | 1,355 | `roof:colour`        | 18,551 |
|   6 | `building:material`           | 1,039 | `roof:material`      | 16,819 |
|   7 | `roof:colour`                 |   904 | `building:colour`    | 16,750 |
|   8 | `building`                    |   847 | `building:material`  | 15,960 |
|   9 | `building:min_level`          |   786 | `roof:height`        | 14,101 |
|  10 | `addr:housenumber`            |   773 | `building`           | 12,912 |
|  11 | `addr:city`                   |   770 | `roof:levels`        | 10,208 |
|  12 | `min_height`                  |   766 | `addr:city`          |  9,789 |
|  13 | `addr:postcode`               |   764 | `addr:postcode`      |  9,759 |
|  14 | `addr:country`                |   723 | `addr:housenumber`   |  9,757 |
|  15 | `addr:suburb`                 |   699 | `addr:street`        |  9,484 |
|  16 | `addr:place`                  |   470 | `addr:country`       |  8,476 |
|  17 | `roof:height`                 |   443 | `min_height`         |  7,950 |
|  18 | `roof:material`               |   419 | `name`               |  6,152 |
|  19 | `roof:levels`                 |   391 | `roof:orientation`   |  5,164 |
|  20 | `addr:street`                 |   332 | `roof:direction`     |  4,298 |
|  21 | `layer`                       |   320 | `building:min_level` |  3,863 |
|  22 | `name`                        |   298 | `wheelchair`         |  3,089 |
|  23 | `roof:orientation`            |   174 | `addr:suburb`        |  2,448 |
|  24 | `wikidata`                    |   143 | `amenity`            |  2,415 |
|  25 | `roof:direction`              |   132 | `layer`              |  2,182 |
|  26 | `wheelchair`                  |   127 | `opening_hours`      |  1,825 |
|  27 | `start_date`                  |   105 | `entrance`           |  1,821 |
|  28 | `wikimedia_commons`           |   105 | `level`              |  1,717 |
|  29 | `entrance`                    |    91 | `website`            |  1,581 |
|  30 | `building:levels:aboveground` |    91 | `wikidata`           |  1,501 |

|   # | Berlin key=value            |     n | Germany key=value           |      n |
| --: | --------------------------- | ----: | --------------------------- | -----: |
|   1 | `building:part=yes`         | 4,303 | `building:part=yes`         | 41,531 |
|   2 | `roof:shape=flat`           | 1,198 | `roof:shape=flat`           | 15,048 |
|   3 | `building:levels=1`         |   968 | `roof:shape=gabled`         | 10,027 |
|   4 | `addr:city=Berlin`          |   744 | `addr:country=DE`           |  8,471 |
|   5 | `addr:country=DE`           |   723 | `building:levels=1`         |  8,375 |
|   6 | `building:levels=5`         |   721 | `building:levels=2`         |  6,983 |
|   7 | `building:levels=2`         |   651 | `roof:material=roof_tiles`  |  6,200 |
|   8 | `building:levels=4`         |   533 | `roof:levels=1`             |  5,470 |
|   9 | `building:min_level=1`      |   496 | `building:levels=3`         |  5,166 |
|  10 | `building:levels=6`         |   467 | `building:material=plaster` |  4,846 |
|  11 | `addr:place=Stadtbahnbogen` |   464 | `roof:shape=skillion`       |  4,543 |
|  12 | `building:levels=3`         |   448 | `building:levels=4`         |  4,051 |
|  13 | `building:levels=7`         |   324 | `building=yes`              |  3,881 |
|  14 | `building:material=brick`   |   302 | `building:colour=white`     |  3,840 |
|  15 | `building=apartments`       |   292 | `building:material=brick`   |  3,584 |
|  16 | `building:material=plaster` |   282 | `building=apartments`       |  3,082 |
|  17 | `roof:shape=gabled`         |   275 | `building:levels=5`         |  2,715 |
|  18 | `addr:suburb=Mitte`         |   239 | `roof:levels=0`             |  2,609 |
|  19 | `roof:levels=1`             |   205 | `roof:material=tar_paper`   |  2,603 |
|  20 | `building:material=glass`   |   187 | `roof:orientation=along`    |  2,569 |
|  21 | `building:part=commercial`  |   168 | `roof:orientation=across`   |  2,562 |
|  22 | `building:levels=8`         |   165 | `roof:shape=pyramidal`      |  2,331 |
|  23 | `roof:shape=skillion`       |   157 | `roof:shape=hipped`         |  2,050 |
|  24 | `roof:levels=0`             |   155 | `building:min_level=1`      |  2,041 |
|  25 | `layer=1`                   |   155 | `wheelchair=yes`            |  1,896 |
|  26 | `roof:material=roof_tiles`  |   151 | `roof:material=metal`       |  1,761 |
|  27 | `building:part=roof`        |   128 | `roof:colour=gray`          |  1,727 |
|  28 | `addr:postcode=10557`       |   128 | `building:material=glass`   |  1,649 |
|  29 | `building:min_level=2`      |   121 | `roof:levels=2`             |  1,644 |
|  30 | `building:part=industrial`  |   119 | `addr:city=Lübeck`          |  1,597 |

## Q3. Classification of member tags

Shares are of present member entries.

Kind A:

| Class                           | Berlin n | Berlin share | Germany n | Germany share |
| ------------------------------- | -------: | -----------: | --------: | ------------: |
| untagged                        |    5,719 |        91.1% |    57,691 |         89.5% |
| a duplicate of relation         |       11 |         0.2% |       319 |          0.5% |
| b own feature                   |      191 |         3.0% |     3,205 |          5.0% |
| c noise only                    |      272 |         4.3% |     1,745 |          2.7% |
| d other                         |       83 |         1.3% |     1,471 |          2.3% |
| relation member                 |        0 |         0.0% |        32 |          0.0% |
| missing (not counted in shares) |        2 |            - |        13 |             - |

Kind B:

| Class                           | Berlin n | Berlin share | Germany n | Germany share |
| ------------------------------- | -------: | -----------: | --------: | ------------: |
| untagged                        |      451 |        72.2% |     8,077 |         85.8% |
| a duplicate of relation         |        6 |         1.0% |        83 |          0.9% |
| b own feature                   |       50 |         8.0% |       669 |          7.1% |
| c noise only                    |        0 |         0.0% |        85 |          0.9% |
| d other                         |      118 |        18.9% |       495 |          5.3% |
| relation member                 |        0 |         0.0% |         2 |          0.0% |
| missing (not counted in shares) |        0 |            - |         0 |             - |

Kind C:

| Class                           | Berlin n | Berlin share | Germany n | Germany share |
| ------------------------------- | -------: | -----------: | --------: | ------------: |
| untagged                        |    4,524 |        54.6% |   484,689 |         48.9% |
| a duplicate of relation         |       42 |         0.5% |     3,079 |          0.3% |
| b own feature                   |    3,543 |        42.7% |   475,522 |         48.0% |
| c noise only                    |       22 |         0.3% |    20,473 |          2.1% |
| d other                         |      155 |         1.9% |     6,681 |          0.7% |
| relation member                 |        2 |         0.0% |       155 |          0.0% |
| missing (not counted in shares) |        9 |            - |     2,534 |             - |

Kind D:

| Class                           | Berlin n | Berlin share | Germany n | Germany share |
| ------------------------------- | -------: | -----------: | --------: | ------------: |
| untagged                        |       51 |         0.8% |       908 |          1.3% |
| a duplicate of relation         |       15 |         0.2% |       197 |          0.3% |
| b own feature                   |    6,074 |        89.7% |    64,602 |         91.9% |
| c noise only                    |        1 |         0.0% |        51 |          0.1% |
| d other                         |      517 |         7.6% |     3,569 |          5.1% |
| relation member                 |      117 |         1.7% |     1,004 |          1.4% |
| missing (not counted in shares) |        0 |            - |         0 |             - |

Reasons for the b and d classes. The b columns list the feature keys that made a member an own feature; the d columns list why a member was "other" (a new non-feature key, or a non-feature value that differs from the relation):

### Kind A

|   # | Berlin own-feature key (b) |   n | Germany own-feature key (b) |   n | Berlin other (d) reason             |   n | Germany other (d) reason           |   n |
| --: | -------------------------- | --: | --------------------------- | --: | ----------------------------------- | --: | ---------------------------------- | --: |
|   1 | `building:part`            |  48 | `leisure`                   | 601 | `new non-feature area`              |  23 | `new non-feature addr:city`        | 547 |
|   2 | `building`                 |  45 | `landuse`                   | 539 | `new non-feature heritage:operator` |  17 | `new non-feature addr:street`      | 530 |
|   3 | `landuse`                  |  27 | `building`                  | 454 | `new non-feature lda:criteria`      |  17 | `new non-feature addr:housenumber` | 527 |
|   4 | `leisure`                  |  22 | `building:part`             | 439 | `new non-feature ref:lda`           |  17 | `new non-feature addr:postcode`    | 509 |
|   5 | `amenity`                  |  18 | `man_made`                  | 385 | `new non-feature heritage`          |  16 | `new non-feature addr:country`     | 477 |
|   6 | `man_made`                 |  17 | `barrier`                   | 249 | `new non-feature addr:postcode`     |  13 | `new non-feature area`             | 317 |
|   7 | `parking`                  |  10 | `amenity`                   | 221 | `new non-feature addr:street`       |  13 | `new non-feature addr:suburb`      | 130 |
|   8 | `barrier`                  |   6 | `highway`                   | 143 | `new non-feature addr:city`         |  12 | `new non-feature name`             |  72 |

### Kind B

|   # | Berlin own-feature key (b) |   n | Germany own-feature key (b) |   n | Berlin other (d) reason                |   n | Germany other (d) reason               |   n |
| --: | -------------------------- | --: | --------------------------- | --: | -------------------------------------- | --: | -------------------------------------- | --: |
|   1 | `building:part`            |  29 | `barrier`                   | 225 | `conflict non-feature building:levels` |  85 | `conflict non-feature building:levels` | 221 |
|   2 | `building`                 |  13 | `building:part`             | 149 | `conflict non-feature height`          |  18 | `conflict non-feature height`          |  97 |
|   3 | `natural`                  |   3 | `building`                  | 118 | `new non-feature roof:colour`          |  11 | `conflict non-feature roof:colour`     |  64 |
|   4 | `water`                    |   3 | `railway`                   | 100 | `new non-feature roof:shape`           |   9 | `new non-feature roof:material`        |  57 |
|   5 | `level`                    |   2 | `public_transport`          |  66 | `new non-feature building:material`    |   7 | `conflict non-feature roof:material`   |  52 |
|   6 | `landuse`                  |   2 | `level`                     |  58 | `new non-feature building:colour`      |   7 | `conflict non-feature roof:shape`      |  49 |
|   7 | `indoor`                   |   1 | `indoor`                    |  54 | `new non-feature building:levels`      |   7 | `new non-feature roof:shape`           |  31 |
|   8 | `railway`                  |   1 | `leisure`                   |  35 | `new non-feature roof:height`          |   6 | `new non-feature building:colour`      |  27 |

### Kind C

|   # | Berlin own-feature key (b) |   n | Germany own-feature key (b) |       n | Berlin other (d) reason             |   n | Germany other (d) reason         |     n |
| --: | -------------------------- | --: | --------------------------- | ------: | ----------------------------------- | --: | -------------------------------- | ----: |
|   1 | `natural`                  | 880 | `natural`                   | 221,161 | `conflict non-feature capacity`     |  33 | `new non-feature area`           | 1,191 |
|   2 | `landuse`                  | 808 | `landuse`                   | 174,991 | `conflict non-feature surface`      |  27 | `new non-feature surface`        |   575 |
|   3 | `barrier`                  | 571 | `water`                     |  36,770 | `new non-feature area`              |  21 | `new non-feature name`           |   573 |
|   4 | `railway`                  | 477 | `barrier`                   |  19,249 | `new non-feature landcover`         |  13 | `conflict non-feature wetland`   |   509 |
|   5 | `leisure`                  | 248 | `highway`                   |  18,689 | `conflict non-feature name`         |  11 | `conflict non-feature leaf_type` |   448 |
|   6 | `water`                    | 201 | `leisure`                   |  12,538 | `new non-feature surface`           |   9 | `conflict non-feature name`      |   387 |
|   7 | `building`                 | 169 | `man_made`                  |   8,689 | `new non-feature heritage`          |   8 | `new non-feature bridge:support` |   324 |
|   8 | `amenity`                  | 168 | `building`                  |   7,844 | `new non-feature heritage:operator` |   8 | `new non-feature meadow`         |   243 |

### Kind D

|   # | Berlin own-feature key (b) |     n | Germany own-feature key (b) |      n | Berlin other (d) reason            |   n | Germany other (d) reason           |     n |
| --: | -------------------------- | ----: | --------------------------- | -----: | ---------------------------------- | --: | ---------------------------------- | ----: |
|   1 | `building:part`            | 5,109 | `building:part`             | 47,944 | `new non-feature addr:city`        | 455 | `new non-feature addr:housenumber` | 1,370 |
|   2 | `building`                 |   811 | `building`                  | 11,490 | `new non-feature addr:country`     | 455 | `new non-feature addr:city`        | 1,353 |
|   3 | `entrance`                 |    91 | `amenity`                   |  2,388 | `new non-feature addr:postcode`    | 455 | `new non-feature addr:postcode`    | 1,353 |
|   4 | `amenity`                  |    79 | `entrance`                  |  1,821 | `new non-feature addr:housenumber` | 454 | `new non-feature addr:country`     | 1,322 |
|   5 | `barrier`                  |    47 | `level`                     |  1,712 | `new non-feature addr:suburb`      | 454 | `new non-feature roof:edge`        |   995 |
|   6 | `man_made`                 |    47 | `shop`                      |  1,198 | `new non-feature addr:place`       | 448 | `new non-feature addr:street`      |   909 |
|   7 | `tourism`                  |    29 | `indoor`                    |    777 | `new non-feature roof:ridge`       |  20 | `new non-feature addr:suburb`      |   723 |
|   8 | `level`                    |    26 | `historic`                  |    609 | `new non-feature roof:edge`        |  18 | `new non-feature roof:ridge`       |   668 |

## Q4. `type=building` relations

Member roles and tags are in Q2 (kind D). Indoor-type keys on member entries with tags beyond noise:

| Key on member entries (tags beyond noise) | Berlin n | Berlin share of entries | Germany n | Germany share of entries |
| ----------------------------------------- | -------: | ----------------------: | --------: | -----------------------: |
| `level`                                   |       26 |                    0.4% |     1,717 |                     2.4% |
| `indoor`                                  |        1 |                    0.0% |       779 |                     1.1% |
| `room`                                    |        0 |                    0.0% |       165 |                     0.2% |
| `door`                                    |        6 |                    0.1% |       641 |                     0.9% |
| `level:ref`                               |        0 |                    0.0% |        11 |                     0.0% |
| `repeat_on`                               |        0 |                    0.0% |        22 |                     0.0% |
| `entrance`                                |       91 |                    1.3% |     1,821 |                     2.6% |
| `min_height`                              |      766 |                   11.3% |     7,950 |                    11.3% |
| `building:min_level`                      |      786 |                   11.6% |     3,863 |                     5.5% |
| `building:levels`                         |    4,557 |                   67.3% |    32,094 |                    45.6% |
| `height`                                  |    2,004 |                   29.6% |    28,772 |                    40.9% |
| `building:part`                           |    5,109 |                   75.4% |    47,964 |                    68.2% |

Type tags of relation members in `type=building` relations:

| Type tag of a relation member | Berlin n | Germany n |
| ----------------------------- | -------: | --------: |
| `multipolygon`                |      101 |       840 |
| `level`                       |       15 |       108 |
| `building`                    |        1 |        23 |
| `site`                        |        0 |        14 |
| `parking`                     |        0 |         1 |
| `(none)`                      |        0 |        18 |

- Members with `indoor`, `room`, `door`, `level` or `level:ref`: Berlin 1773763, 3378412, 3728536, 4065110, 4155564, 5650844, 5682486, 7907766; Germany 5767, 132297, 358788, 361009, 443257, 555441, 555479, 555525

## Q5. Example relation ids

Ids only, ascending, first eight per class in each extract (not ranked by interest). To look one up, open `https://www.openstreetmap.org/relation/<id>` in a browser; this research made no requests.

Kind A (`building=*`):

- A class `a duplicate of relation`: Berlin 176794, 176795, 3849554, 9457888, 18240912, 20954331; Germany 11007, 13230, 13973, 14301, 37481, 67928, 154484, 176794
- A class `b own feature`: Berlin 3197, 10657, 13607, 23745, 28126, 28129, 86327, 168590; Germany 3197, 3938, 5758, 5783, 5789, 6117, 6168, 6187
- A class `c noise only`: Berlin 7228, 15217, 23745, 29748, 88911, 88912, 145107, 168559; Germany 5626, 5760, 5764, 5846, 6117, 7074, 7228, 10696
- A class `d other`: Berlin 3221, 3619, 13234, 18104, 28134, 28600, 30039, 68163; Germany 3221, 3619, 5764, 6117, 6360, 10922, 13234, 13975

Kind B (`building:part=*`):

- B class `a duplicate of relation`: Berlin 5886328, 5965724, 16873519, 18800664; Germany 71104, 1621111, 2073382, 2073404, 2283990, 2345442, 2908170, 3340533
- B class `b own feature`: Berlin 53333, 3838886, 4729456, 4836799, 5242650, 5336147, 5336289, 5405431; Germany 53333, 71104, 123836, 272056, 533150, 533521, 1169807, 1299163
- B class `c noise only`: Berlin ; Germany 142277, 1595159, 1595160, 2784394, 3438947, 3438948, 4003180, 4003181
- B class `d other`: Berlin 51672, 2021327, 2047866, 3539307, 3838886, 4785144, 4840043, 5242648; Germany 51672, 71104, 123836, 272056, 1299163, 1414311, 1657746, 2021327

Kind C (other):

- C class `a duplicate of relation`: Berlin 2017636, 2962489, 3085954, 3218161, 3600566, 4165664, 8165361, 9379744; Germany 7667, 8750, 10717, 20190, 23447, 23813, 28753, 33719
- C class `b own feature`: Berlin 3217, 3295, 3410, 4026, 4219, 4618, 5007, 5399; Germany 882, 2287, 2349, 2368, 2433, 2434, 2442, 2524
- C class `c noise only`: Berlin 53477, 53487, 1143643, 1243217, 3755546, 4106235, 4106236, 4106237; Germany 2886, 3109, 3110, 3127, 3134, 3182, 3613, 3707
- C class `d other`: Berlin 3410, 22807, 54741, 56951, 953056, 1166477, 1273140, 1663603; Germany 2434, 3410, 6128, 6717, 7289, 8430, 8725, 10115

Kind D (`type=building`):

- D class `a duplicate of relation`: Berlin 2017596, 15582054, 16250906, 19277334, 20439516, 20439517, 20443639, 20444822; Germany 132297, 557766, 1815218, 2017596, 2277359, 3202041, 3202082, 3768720
- D class `b own feature`: Berlin 14987, 20460, 20461, 29971, 86081, 300149, 1403042, 1478582; Germany 5767, 8026, 8876, 14987, 20460, 20461, 29971, 33266
- D class `c noise only`: Berlin 5662445; Germany 1111173, 2171271, 2270487, 2849165, 2870814, 3145112, 3746169, 4022431
- D class `d other`: Berlin 1773763, 3720783, 4051977, 5118989, 5391761, 5684273, 5968837, 7502290; Germany 5767, 8026, 157348, 412266, 1020712, 1331685, 1370729, 1736460

- Members with `indoor`, `room`, `door`, `level` or `level:ref`: Berlin 1773763, 3378412, 3728536, 4065110, 4155564, 5650844, 5682486, 7907766; Germany 5767, 132297, 358788, 361009, 443257, 555441, 555479, 555525

## What this means for the inspector

Inferred from the numbers above; not tested in the UI.

- **Kind A (building multipolygons):** the column would be empty for most relations. About one in six Germany relations (17.4%; Berlin 14.9%) has a tagged member, and one in twelve (8.0%; Berlin 4.8%) has an own feature. A useful design shows member tags only when a member carries some and otherwise stays out of the way. The case that matters is the own-feature inner ring (parking, leisure, landuse, building:part inside a building).
- **Kind C (other multipolygons):** the member tags are real content (a `natural=water` or `landuse=*` ring inside another area, `barrier=fence` on rings, railway platforms). Three quarters of the Germany relations have at least one tagged member, so a member list with the tags is worth having here, the way the route column is.
- **Kind D (`type=building`):** almost every member is tagged, and the tags are the building's data (parts, levels, heights, roofs, entrances). A member list with the tags, like a route's members, fits this data best. The IndoorOSM leftovers (`level`, `room`, `door`, `indoor`, and `type=level` relation members) are a small minority and would need their own row style.
- **Kind B (`building:part` only):** mostly plain geometry (72% untagged in Berlin, 86% in Germany). The tagged cases are mostly conflicts on `building:levels` and `height`, which a member row could show as "differs from the relation".
- The b and d reasons in Q3 are what a column would have to label. They are the starting point if a designer wants a rule for which members to show.

## Open questions

- **Rule sensitivity (kind C, Germany):** the first run, where a feature key with another value counted as d, had 202,573 entries in d; 140,714 of them were `landuse` value conflicts and 45,802 `natural` value conflicts. The current rule moves them to b. Whether such an inner ring is "own feature" or "other" changes the kind C class shares a lot, so a designer should decide it.
- **Missing members:** Germany has 2,547 member entries (kind C: 2,534) whose way is absent from the extract (1,831 distinct ways); Berlin 11 entries, 11 distinct ways. The extract boundary or deletions may explain them. Not checked.
- **Snapshot only:** the counts are for one planet state per extract. How member tags change over time, and who adds them, is not measured.
- **Relation and node members** (kind D: 1,004 relation members in Germany; 5,747 node members, mainly entrances) are counted by role and type, but their tags are not classified further.
- **`type=level` relations inside `type=building`** (108 in Germany) are only counted, not analysed.
- **Brandenburg** (`brandenburg-latest.osm.pbf`, present in the local cache) was not run.

## Plan for Maid (2026-10-21, parked)

Tobias, 2026-10-21: the relation column was built for route-like relations (bus, bicycle, hiking). For area relations it has no advantage: the members are mostly plain geometry that is edited on the map. The measurements above back that for buildings: 85 % of the building multipolygons in Berlin (83 % in Germany) have no member with tags. Where members have tags, they are features of their own (a `building:part`, a wall, a landuse that shares the outline), rarely a copy of the relation's tags.

1. **The column only for route-like relations.** Selecting or "Open" opens the column for `type=route`, `route_master` and `superroute` only. Every other relation shows its members in the inspector's Members section (the section is there today, now only with the "Open" line). Open: boundaries (`type=boundary`, long rings of ways) and `public_transport=stop_area`: column or inspector?
2. **A compact member list in the inspector for area relations.** One row per member: the role as a chip (outer, inner, part; editable), the member, hover shows it on the map, a click selects it, the trash takes it out. "Add to a relation" stays on the member's side, as today.
   - An untagged member is geometry only: its row says "Outline" and the id, nothing more; the rows of a building with only untagged outlines stay one short list.
   - A member with tags of its own (about 5 to 8 % of the entries of building multipolygons, half of the entries of other multipolygons) shows its preset icon and name and its two most telling tags (for a part: `building:levels`, `height`, `roof:shape`), so the data is seen without selecting each member.
   - A member that repeats the relation's tags (old-style tagging, 0.2 to 0.5 % of the entries) gets a hint with a one-step fix that removes the copies from the member, as iD's outdated-tags validation does. It may live in validation instead.
3. **`type=building` relations** (887 in Berlin, 12,409 in Germany) list their parts with levels, height and roof, highest part last. They connect to the level work: the 3D view could extrude the parts of the selected building ([indoor/README.md](indoor/README.md)).
4. **A check** on a scene with building multipolygons (`medium` or `dense`): the column does not open for them, the list shows roles and the tagged member's data, a role change and a removal are one undo step each.
