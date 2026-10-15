# Relation fixture: scene `relations`

Status: built on 2026-10-15 for Tobias, with `bun run fixtures-build <pbf> --scene relations`. Nothing else was rebuilt. Not yet reviewed by Tobias. No map was rendered or looked at; every fact below comes from the fixture data.

Markers: **Read** means seen in the fixture or in the extract. **Inferred** means my conclusion. **Not checked** means I did not look.

## What it is for

- A test scene for relation features: route members, one-way side ways beside a road, superroutes and route masters, turn restrictions, multipolygons with inner rings, and route gaps.
- It covers the scenarios of [relation-handling.md](relation-handling.md), sections 4, 7 and 8.
- Centre `[13.5729, 52.445]`, zoom 17. A 1280 by 800 px view at zoom 17 is about 0.9 by 0.6 km, so it stays inside the box (Inferred from the zoom scale).
- No notes file: `fixtures/notes/relations.json` was not added, so its notes endpoint answers an empty collection.

## Box and source

- Box `[13.56058, 52.43938, 13.5827, 52.44837]` (west, south, east, north): 1.5 km by 1.0 km, Köpenick, along Müggelheimer Straße.
- Source: `berlin-latest.osm.pbf`, the file of the other scenes, timestamp `2026-08-06T20:21:21Z`, osmium 1.19.1.
- Extract: `osmium extract -s complete_ways`, as in `tools/fixtures/build.ts`. Complete ways keep their nodes; relations keep their full member lists, so members outside the box show as missing.
- Size: `fixtures/relations.json.gz` is 560,099 bytes. Counts: 19,358 nodes, 3,420 ways, 190 relations.

### How the box was chosen

- Pre-score: 1.5 km by 1.0 km windows over Berlin, ranked by bicycle and other route member ways, one-way side ways, ways shared by routes, superroutes and restrictions with `except=bicycle`. The top 60 windows were kept (Read).
- Exact check: the top 40 windows were extracted as the build does and checked for each scenario (Read).
- Central windows (Mitte, Friedrichshain) hit most scenarios but had few hiking routes and few restrictions with `except=bicycle` (Read).
- This box meets all seven scenarios on its exact extract. A window about 0.5 km north (`[13.56058, 52.44387, 13.5827, 52.45286]`) has the same main features and more hiking routes; it was not used (Read, Inferred).

## Scenarios and where they are

| Scenario | Relations | Ways | Nodes | Tags that matter |
| --- | --- | --- | --- | --- |
| 1. Bicycle route on a main road, one-way side ways on both sides, route on the centre line | 156492 bicycle `rcn` DRW "Dahme Radweg"; 335268 bicycle `rcn` SPR "Spreeradweg"; 12138360 bicycle `ncn` D3 "D-Netz Route 3"; 16487091 bicycle `icn` R1; 16490324 bicycle `icn` EV2; 11717122 bicycle `lcn` RuM "Rund um den Müggelsee" | Road centre: 382268843, 1448665934, 61231309 (`highway=secondary`, "Müggelheimer Straße"). Side ways: 909384717 (`highway=cycleway`, `oneway=yes`, `is_sidepath=yes`; right of 382268843, left of 61231309) and 1021333856 (`highway=path`, `is_sidepath=yes`, `oneway:bicycle=yes`, no `oneway`; left of 382268843, right of 61231309) | none | Read: the routes use the three centre ways. The road ways also carry `cycleway:right=track`. |
| 1b. Same, with `highway=cycleway` on both sides | 335268, 12138360, 16487091, 16490324 on road 1120743511; hiking 2350597 and 14988037 too | 1120743511 (`highway=residential`, "Gutenbergstraße") with side ways 934703165 (right, 19 m) and 934703166 (left, 19 m), both `highway=cycleway`, `oneway=yes` | none | Read |
| 2. Route turns where the side way has no node at the turn | 156492 turns at node 31492285 (84 degrees). 335268 turns at 8068545704 (84), 8675822223 (71), 8675822224 (106) | Node 31492285 (52.444388, 13.573830) is a junction on Müggelheimer Straße. Side ways passing within 25 m without this node: 909384717 (8 m), 1021333856 (7 m), 936285890 (16 m), 1433215705 (20 m) | 31492285; 8068545704 (52.444722, 13.569367): ways 1118588006 (cycleway) and 1120743511 meet here. Side ways within 25 m without it: 934703165 (6 m), 934703166 (8 m), 894246784 (12 m), 1219052691 (8 m), 1238012012 (17 m) | Read: a turn of at least 35 degrees and a side way within 25 m without the node. Inferred: the split is needed. |
| 2b. Turn restrictions at the same junction | 951203 `only_straight_on` via 31492285; 8549512 `only_right_turn` via 31492285 | Ways at 31492285: 38703163 and 61231309 (`secondary`), 27075128 and 936285894 (`service`) | 31492285 | Read |
| 3. Several relations on the same way | 16 relations on way 61231309: bicycle 156492, 335268, 11717122, 12138360, 16487091, 16490324; bus 228027 "Buslinie 164", 2004392 "Bus 165", 2194814, 2405630, 2410717, 2925917 "Bus N62", 2925918 "Bus N62" (reverse), 6783678, 11788176, 18455262 "ErsatzBus 27,61,62,63,67,68" | 61231309; 1120586611 (bicycle 156492, 11717122; hiking 3001299, 14988037; bus 18455262); 10780475 (bicycle 156492, 11717122; hiking 3418910, 14988037; bus 2064835, 6783677, 18455262) | none | Read |
| 4. Superroute or route master | Superroute 6102 bicycle `rcn` "Spreeradweg": 7 members, of which only 335268 is in the fixture (335269, 335270, 335271, 335272, 14281922, 13854750 are outside). Route masters: 14 of 15 have all their members in the fixture, for example 19115 "Tram 63", 17822 "Bus N65", 35055 "Buslinie 164", 93861 "Bus 165", 2413847 "S47". 1227015 "Bus 162" has 2 of 4 members | none | none | Read |
| 4b. Hiking superroute | 14988038 hiking "Paul-Gerhardt-Weg": 10 members, 1 in the fixture | none | none | Read |
| 5. Hiking route | 2350597 hiking `lwn` ref 1 "Spreeweg" (37 of 758 members in fixture); 2352152 hiking `lwn` ref 9 "Dahmeweg" (36 of 250); 3001299 hiking `rwn` "Müggel-Spree-Weg" (28 of 761; roles include `alternative`, `guidepost`); 3418910 hiking `iwn` ref E11 "Europäischer Fernwanderweg E11, Berlin" (31 of 775); 14988037 hiking `rwn` "Paul-Gerhardt-Weg Etappe 2" (60 of 206) | 1120586611, 10780475, 25274110 | none | Read |
| 6. Turn restriction with `except=bicycle` | 951204 `only_straight_on`, `except=bicycle;psv`; 14169703 `only_left_turn`, `except=bicycle` | 951204: from 1448665934, to 61231307. 14169703: from 148614180 (Rosenstraße), to 148614174 (Kietzer Straße) | via node 95945666 (52.444464, 13.573830; 8.4 m from 31492285) for 951204; via node 1616941604 (52.445674, 13.576808) for 14169703 | Read |
| 7. Multipolygon with inner ring | Complete, with inner rings: 1849243 "Schlosshof" (outer 137217608; inner 137222235, 137192129); 57493 "Rathaus Köpenick" (outer 28283615, 1014105883; inner 28929179); 287107 (outer 10275147; inner 11086799); 1721362 (outer 127058920; inner 127058961); 7826819 (outer 548174645; inner 548174643). Incomplete: 5415 "Dahme" (outer 28077552 and inner 333893458 in the fixture; inner 5060709 outside) | inner ways listed above | none | Read |
| 7b. Route with a gap | 156492 "Dahme Radweg": way 1448665934 is followed by 40191602, and they do not join. 335268 "Spreeradweg": 1118588006 is followed by 353720495. 14988037 "Paul-Gerhardt-Weg Etappe 2": 137219847 is followed by 137198639, and 137223951 by 137219847 | the ways named in the cell | none | Read: the two members are consecutive in the member list and both in the fixture. Inferred: a real gap in the data, not a cut. |

Notes on the table:

- Routes in the fixture are long-distance routes. Their full member lists are kept, so most members are missing: 156492 has 677 members and 63 in the fixture; 335268 has 790 and 53.
- Route member order was not checked for out-of-order members (a later member joining an earlier one that is not its neighbour). Not checked.
- The junction test is a heuristic (25 m, at least 35 degrees). Whether a split is the right fix was not checked on a map. Not checked.

## What the area does not have

- No primary or trunk road (`highway=primary`, `trunk`): the main road with side ways is `secondary`, and the other road with side ways is `residential`. Read.
- No bicycle route master: all 15 route masters are bus, tram or S-Bahn. Read.
- No foot route (`route=foot`). Read.
- No superroute with all its members in the fixture. Read.
- The two sides of Müggelheimer Straße are not the same kind of way: one is a `cycleway`, the other a `path` with `is_sidepath=yes`. Read.
- Multipolygon 5415 is incomplete: one inner ring is outside the box. The other multipolygons in the box are complete. Read.
- Gaps and out-of-order members in the full member order were not checked for every route. Not checked.

## Attribution

© OpenStreetMap contributors, ODbL 1.0. The same line as in `fixtures/relations.meta.json`.

## Rebuild

`bun run fixtures-build <path to berlin-latest.osm.pbf> --scene relations` rebuilds this scene only. A person runs it (core rule 1). Without `--scene`, every scene is rebuilt.
