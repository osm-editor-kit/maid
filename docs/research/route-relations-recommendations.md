# Route relations: what the OSM wiki recommends, and what iD offers

Sources read: the wiki pages Relation:route, Relation:route_master, Relation:superroute, Public_transport (PTv2 section), Tag:route=bus, Cycle_routes, Tag:route=bicycle, Walking_Routes, Tag:route=hiking, Tag:route=foot, Key:network (bicycle and foot values only); iD preset data from `.reference/id/node_modules/@openstreetmap/id-tagging-schema/dist/` (presets.json, fields.json).
Date: 2026-10-17. Read once with Tobias's OK (core rule 1 exception).

How this was made: the wiki pages were read with WebFetch, which returns a short model-written summary of each page, not the page text. Treat the points below as leads to check against the wiki before they become code or UI text. Items marked **[inferred]** are not stated on the page they are attributed to. Items marked **[iD]** are measured from the preset files.

Coverage gaps: Relation:route was read to about 100,000 of about 108,800 characters; the last part (mostly the long tail of role lists and examples) was not read. Key:network gave only partial content, so the level meanings for icn/rcn/lcn and iwn/rwn/lwn are not confirmed.

---

## 0. Rules shared by all route relations

- Route tags go on the relation only (`type=route` plus `route=*`). Putting `route=*` on a node, way or area is the most common mistake named on every page.
- `network` describes the wider system a route belongs to (for example a national network). The bicycle and walking pages call it required. **[iD]** the bicycle and foot presets offer it as a network-level field, not as a required field.
- `ref` (the number or letter) is recommended, and can be left out when a `route_master` already gives the line number.
- `name` is important for most routes. For bus lines the wiki disagrees with itself (see section 1).
- Member order matters for most route types: it gives the direction, a readable elevation profile, and the signpost direction when `signed_direction=yes` is set. iD has no automatic member sort. Its ordering breaks when a route forks, loops, or a member way is split (wiki, Relation:route).
- Automated mass edits to fix these tags are discouraged on the bicycle, hiking and foot pages unless the editor knows the tags well.

---

## 1. Bus (PTv2)

### Required and recommended tags
- Required: `type=route`, `route=bus`.
- Recommended: `public_transport:version=2` (PTv2 page; **not** in iD's bus preset), `ref` (the line number, for example "4A"), `from` and `to` (the start and end stop names), `via` (only when several variants share a direction), `operator`, `network`, `colour`, `interval`, `duration`, `opening_hours`.
- `ref:<abbreviation>` for a local reference that differs from `ref`; `official_name` when one exists.
- `state=temporary` for a detour (Tag:route=bus).
- Disputed: `name` as a long description, for example "Bus 201: A → B". The PTv2 page calls this "questionable, contentious" and says it is frowned upon. The Tag:route=bus page goes further and says such names are invalid under PTv2 and should be removed. The two pages disagree in strength; the safe rule is "do not invent this form, and warn if it appears".

### Member roles and what members are allowed
- Ways: empty role (PTv2). The wiki says forward/backward and the old `route` role are not used on PTv2 routes; they belong to PTv1. `hail_and_ride` marks road sections where a bus can stop on request.
- Stop positions (on the road, `public_transport=stop_position`, `bus=yes`): role `stop`. Some pages also list `stop_entry_only` and `stop_exit_only` (Tag:route=bus). The PTv2 page does not list these two roles, so treat them as allowed but not required.
- Platforms (`public_transport=platform`, `highway=bus_stop`): role `platform`. The same note applies to `platform_entry_only` and `platform_exit_only`.
- Stop positions are optional: when a stop has no separate stop position or platform, the wiki says it is not necessary to add one just to include it.
- Only ways, nodes and these roles should appear. Relations as members are not part of a bus route.

### Member order rules
1. Stops first, in station order: stop position 1, platform 1, stop position 2, platform 2, and so on. Each stop position is immediately followed by its platform (Tag:route=bus).
2. Then the ways, in order from the first stop to the last, connected end to end.
3. One relation per direction. A bus route with forks needs a separate relation for each variant.

### Nesting
- `route_master` groups all directions and variants of one line (for example, outward and return, or a weekend variant). Members of a master are only `type=route` relations, with empty roles.
- A master is not needed for a single round-trip relation (PTv2 page).
- The master groups variants of one line, not different lines of a network.

### Typical mistakes
- `route=bus` on a stop or way instead of the relation.
- Duplicated ways (a way added twice), which the bus page names as a common result of selecting several ways that already belong to a relation.
- Unordered members, especially at forks and loops.
- Old PTv1 roles (`forward:stop`, `stop:N`, `platform:N`) or old PTv1-only relations.
- Names that combine vehicle, number and end stops.

### What an editor could check automatically
- Exactly one `type=route` and `route=bus` on the relation; no `route=*` on member nodes or ways.
- `public_transport:version=2` present.
- `from` and `to` present (warn only).
- Member roles: ways have an empty role; stop roles are one of `stop`, `stop_entry_only`, `stop_exit_only`, `hail_and_ride`; platform roles are one of `platform`, `platform_entry_only`, `platform_exit_only`. Flag `forward`, `backward`, `route` and numbered PTv1 roles.
- Each stop position is directly followed by its platform in member order (or it is a lone stop with no platform, which is allowed).
- The ways form one connected chain in order: each way's end meets the next way's start, with no duplicates.
- Each member has a known role for its geometry (a node with role `stop` is a stop position node, a way with role `platform` is a platform way).
- Warn when `name` contains the vehicle type, the route number and the stop names together.
- Every relation with `route_master` has `route_master` set to the same vehicle type as its route, and members are relations only.

---

## 2. Bicycle (route=bicycle)

### Required and recommended tags
- Required: `type=route`, `route=bicycle` (or `mtb` for mountain-bike routes; the wiki says to pick one, not both), `network` (values lcn, rcn, ncn, icn). The Relation:route page says `network` is required for bicycle but optional for mtb; the Tag:route=bicycle page says it is required. Both agree for `route=bicycle`.
- Recommended: `ref`, `name`, `operator`, `cycle_network` (for countries with several networks at the same level), `network:type=node_network` for node-based networks.
- Optional: `from`, `to`, `roundtrip=yes`, `distance`, `ascent`, `descent`, `colour`, `state=proposed` (for routes not yet official), `signed_direction=yes` (the route is ridden one way as signposted).
- **Deprecated:** `route=ncn` as a tag on a way. It clashes with other route types on the same way (Cycle_routes). The route value belongs on the relation.
- **Discouraged:** `oneway=yes` to show direction on a route. The page prefers directional roles, because `oneway` can be mistaken for a legal traffic restriction.

### Member roles and what members are allowed
- Ways: empty role (the normal case). `forward` or `backward` on ways where travel is one-way along part of the route (Tag:route=bicycle). **Not marked as disputed** on these pages, but the wiki does not settle when to use them; Cycle_routes says they show the direction on the cycle map.
- Guideposts: a node with role `guidepost`.
- Alternatives: a way with role `alternative`.
- Section roles for recreational relations: `main` (default), `alternative`, `approach`, `excursion`, `connection`. The page says functional section roles should not be combined with directional `forward`/`backward` roles in the same relation.
- Each member may carry only one role. A member that needs two roles needs a child relation.
- Member relations: allowed under a `type=superroute` relation, and a `type=network` relation can group routes (name, operator, website).

### Member order rules
- For `signed_direction=yes`, ways must be in order; the order sets the signpost direction.
- Otherwise: ways in travel order from start to end, connected.

### Nesting
- Long international routes are split into sections of under about 500 elements each, then combined in a `type=superroute` relation that contains only relations (Tag:route=bicycle).
- Route masters are not discussed on the bicycle pages; the Relation:route_master page says they have "rarely" been used for cycling and recommends `type=route` relations instead.

### Typical mistakes
- `route=bicycle` on nodes, ways or areas.
- Missing `network`.
- Mixing functional section roles with directional roles.
- Using `route=ncn` on a way.
- Automated bulk edits.

### What an editor could check automatically
- `network` is set on a `route=bicycle` relation, with a value from lcn, rcn, ncn, icn (warn for others).
- `route=mtb` and `route=bicycle` not both on the same relation.
- `forward`/`backward` roles appear only on ways; `guidepost` roles only on nodes; `alternative` only on ways.
- A relation does not mix functional section roles with `forward`/`backward`.
- With `signed_direction=yes`, the ways form one chain in order.
- No `oneway=yes` on the member ways that is meant as route direction (warn; it is a legal tag too).
- No `route=ncn` (or other route values) on a way.

---

## 3. Hiking (route=hiking)

### Required and recommended tags
- Required: `type=route`, `route=hiking`, `network` (values iwn, nwn, rwn, lwn).
- Recommended: `name`, `ref`, `operator`, `osmc:symbol` (preferred over `symbol`), `colour`, `from`, `to`, `distance`, `ascent`, `descent`, `roundtrip`, `signed_direction=yes`, `stage`, `state` (alternate, proposed), `survey:date`, `website`, `wikipedia`, `description`.
- `route=hiking` is for routes that need walking boots or more experience (rough, muddy or rocky ground, wading). The easy-walk version is `route=foot`.
- The `pilgrimage` value is almost non-existent. Use `pilgrimage=yes` on the hiking relation.
- **Discouraged:** `symbol=*`, in favour of `osmc:symbol`. **Discouraged:** `oneway=yes` for direction; use `signed_direction=yes` since 2019 (Walking_Routes).
- The Walking_Routes page says German routes need `name`, `symbol` and `osmc:symbol` for the map to render them. Treat this as a country note, not a global rule.

### Member roles and what members are allowed
- Empty or `main` (default): the main sections.
- `forward` and `backward`: one-direction sections.
- `alternative`: a detour that rejoins the main route at a different point.
- `excursion`: a side trip that returns to the same point.
- `approach`: access to parking, stations and similar.
- `connection`: a link to another route; it should appear in both routes.
- `guidepost`, `route_marker`, `parking`: node or way members that mark or serve the route.
- Member relations: a route may contain other route relations (parent and child).

### Member order rules
- Ways in travel order; required when `signed_direction=yes`. Ways should connect to the roads they cross or touch (Walking_Routes).

### Nesting
- A hiking relation can contain child route relations; a superroute groups stages of a long route. The Relation:superroute page suggests keeping individual routes under about 300 elements. This figure is a suggestion, not a rule [inferred from the page text].

### Typical mistakes
- Tags on ways or nodes instead of the relation.
- Adding routes copied from user-made trip-planning sites.
- Unconnected member ways.
- Unsigned or unknown routes: the page asks that a route be signed, documented by a known organisation, or widely known locally.
- `pilgrimage` as the route value.

### Disputed or sensitive points
- In France, mapping the FFRP-owned GR and PR routes is "strongly discouraged" because of copyright. The page names Via Alpina as an alternative. Keep this out of in-app help; it is a country and licence question.
- Routes whose suitability is unclear: the page says to discuss with the local community first.

### What an editor could check automatically
- `network` in iwn/nwn/rwn/lwn present.
- `route=hiking` or `route=foot` on the relation only; no route tag on members.
- Member roles from the list above; `signed_direction=yes` means the ways are in order.
- Warn on `symbol=*`, `pilgrimage` as a route value, and `oneway=yes` on member ways.
- Ways connected end to end (warn on a gap).
- `name` present (warn; the wiki says it is important).

---

## 4. Foot (route=foot)

### Required and recommended tags
- Required: `type=route`, `route=foot`, `network` (iwn/nwn/rwn/lwn). The Walking_Routes page says `network` is required for walking routes.
- Recommended: `name` (meaningful, per Relation:route), `ref`, `operator`, `colour`, `osmc:symbol`, `distance`, `ascent`, `descent`, `from`, `to`, `roundtrip`, `signed_direction=yes`, `website`, `wikipedia`.
- `route=foot` is for ordinary shoes. Use `route=hiking` for walking boots.
- `route=walking` is a wrong value; the page says to check and retag it.
- Same deprecations as hiking: `symbol` (use `osmc:symbol`), `oneway=yes` (use `signed_direction`), and `pilgrimage` as a value.

### Member roles and what members are allowed
- Same role set as hiking: empty or `main`, `forward`, `backward`, `alternative`, `excursion`, `approach`, `connection`, `guidepost`, `route_marker`, `parking`.
- Typical member ways: paths, footways, tracks, steps; also cycleways, service roads, residential roads and higher-class roads (Walking_Routes).

### Member order rules
- Same as hiking: travel order, required for `signed_direction=yes`.

### Nesting
- Same as hiking.

### Typical mistakes
- `route=foot` on nodes, ways or areas.
- `route=walking`.
- `pilgrimage` as a value.
- Unsigned or unknown routes.

### What an editor could check automatically
- As for hiking, with `route=foot` in place of `route=hiking`. Warn when the route runs on higher-class roads only (the page allows them but this is a common sign of a road route, not a walk). [inferred]

---

## 5. route_master

### Required and recommended tags
- Required: `type=route_master`, `route_master=<vehicle>` (bus, ferry, monorail, subway, train, tram or trolleybus), `ref` (the line number).
- Recommended: `name` (for example "Bus 201"), `colour`, `operator`, `network` (required where available), `ref:<qualifier>`, `gtfs:route_id`, `interval` (only when all variants share it), `opening_hours`, `wheelchair`, `tourism`, `school`.
- Tags may sit on the master, the route relations, or both. The page asks editors not to duplicate them.

### Member roles and what members are allowed
- Members must be `type=route` relations only. Roles are empty.
- At least one member; usually two or more.
- Route masters are for public transport lines. For cycling, hiking and road routes they are "rarely" used (Relation:route_master).

### Member order rules
- The wiki gives no order rule for route masters.

### Nesting
- The master sits above the route relations (one per direction or variant). The page links to Relation:superroute in See also but does not explain how the two relate. **[inferred]**: a master should not contain another master.

### Typical mistakes
- Copying tags to master and routes (duplicate tags that can disagree).
- Members that are not `type=route` relations.
- `route_master` value that does not match the member `route` value. **[inferred]** from the vehicle list.

### Status
- Approved. Nothing marked deprecated or disputed on the page.

### What an editor could check automatically
- Members are all `type=route` relations (error otherwise).
- `route_master` value equals each member's `route` value (error on mismatch [inferred]).
- `ref` present; `ref` on master and routes agrees (warn on mismatch).
- Warn on duplicated tags on master and member routes (`operator`, `network`, `colour`, `interval`).
- At least one member (error); two or more (suggest).

---

## 6. superroute

### Required and recommended tags
- `type=superroute` (inferred from the Relation:superroute page and the Tag:route=bicycle page; the superroute tags follow the route tags).
- Tags such as `route`, `ref`, `network` and `name`. Values may differ from members: a European cycle superroute may use `network=icn` while its members use `network=ncn` (Relation:superroute).

### Member roles and what members are allowed
- Members are usually route relations. A superroute may also contain other superroutes (Relation:superroute).
- No member roles are specified on the Relation:superroute page. The bicycle page says a superroute contains only relations, not ways.

### Member order rules
- None stated.

### Nesting
- Two patterns:
  1. Current: a superroute containing route relations, one per stage, section or region.
  2. Older: a `type=route` relation contains shorter route relations recursively, each with a role. The page calls this "alternate (older)" and says it is typical for routes mapped by direction.
- As of October 2023 (per the page), there were more relations nested in route relations (38,647) than in superroutes (19,509).
- Disputed: the US Bicycle Route System community stopped using superroutes in favour of `type=route` nesting (linked discussion on the page).
- Some renderers and tools do not show superroute tags. Tools that handle sub-relations include OSM Route Manager, Waymarked Trails, JOSM and knooppuntnet (Relation:route).

### Typical mistakes
- Not stated on the page. **[inferred]**: ways directly in a superroute; the bicycle page says a superroute should hold only relations.

### Status
- "In use", not deprecated. The page is protected from editing.

### What an editor could check automatically
- Members are relations only (error on ways or nodes).
- Members' `route` values are compatible (warn on a mix of vehicle types). [inferred]
- Warn when a superroute has a single member.

---

## 7. Draft in-app help for each type

These are drafts for the help panel. Each is 2 to 3 short sentences, with a wiki link. Please check against the final wording of the wiki pages before shipping.

**Bus line (route=bus)**
"A bus route groups the stops and the road sections one bus direction uses. Add the line number and the start and end stops, and list the stops in travel order, each stop position followed by its platform. Documentation: https://wiki.openstreetmap.org/wiki/Public_transport"

**Bicycle route (route=bicycle)**
"A cycle route is a signed or named route for bicycles. Choose its network level (local, regional, national or international) and add its number and name. Put the road sections in travel order. Documentation: https://wiki.openstreetmap.org/wiki/Cycle_routes"

**Hiking route (route=hiking)**
"A hiking route is a marked walking route that needs boots or walking experience, such as rough or wet ground. Choose its network level, and add its name, marking and sections in travel order. Documentation: https://wiki.openstreetmap.org/wiki/Tag:route%3Dhiking"

**Foot route (route=foot)**
"A foot route is a marked walking route that ordinary shoes can manage. Choose its network level, and add its name and sections in travel order. Documentation: https://wiki.openstreetmap.org/wiki/Walking_Routes"

**Route master (route_master)**
"A route master groups the directions and variants of one public transport line, such as the outward and return route. It needs the line number and the vehicle type. Documentation: https://wiki.openstreetmap.org/wiki/Relation:route_master"

**Superroute (superroute)**
"A superroute joins several route parts into one long route, for example stages of a hiking trail or a route that crosses borders. Add the route parts as members; do not add single roads to it. Documentation: https://wiki.openstreetmap.org/wiki/Relation:superroute"

---

## 8. iD preset fields vs wiki recommendations

Source of "iD" column: presets.json and fields.json in `.reference/id` (pinned iD copy). A gap means the wiki recommends it and the preset does not offer it in `fields` or `moreFields`.

| Type | iD fields (`fields`) | iD more fields (`moreFields`) | Wiki recommends, iD lacks | Notes |
|---|---|---|---|---|
| bus | name, ref, operator, network, from, to, via | colour, direction (N/S/E/W), distance, duration, interval, opening_hours, roundtrip, wheelchair | `public_transport:version=2` (GAP, required for PTv2 in practice); `ref:<qualifier>` (GAP); `official_name` (GAP); `state=temporary` (GAP) | `name` is offered as a field; the wiki warns against descriptive names |
| bicycle | name, ref, network_bicycle (lcn, rcn, ncn, icn), cycle_network, network:type, from, to, via | ascent, colour, descent, direction, distance, roundtrip | `operator` (GAP: not in preset fields); `state=proposed` (GAP); `signed_direction=yes` (GAP); `forward`/`backward` roles (member-level, not a tag field) | `network` is a combo for the level; wiki says required |
| hiking | name, ref, operator, network_foot (lwn, rwn, nwn, iwn), network:type, from, to, via | ascent, cai_scale-IT, colour, descent, distance, roundtrip | `osmc:symbol` (GAP); `signed_direction` (GAP); `state` (GAP); `description`, `website`, `wikipedia` (GAP); `survey:date` (GAP); `stage` (GAP); `pilgrimage=yes` (GAP) | `cai_scale-IT` is an Italian-only field; the wiki does not mention it |
| foot | same as hiking | same as hiking | same gaps as hiking | Preset is identical to hiking; the wiki distinguishes them by boots vs shoes. Consider an explanatory hint. |
| route_master | name, route_master, ref, operator, network | colour, interval, opening_hours, wheelchair | `ref:<qualifier>` (GAP); `gtfs:route_id` (GAP); `tourism`, `school` (GAP, optional) | Preset uses the vehicle combo; check it offers all six vehicle values |
| superroute | MISSING: no preset `type/superroute` in presets.json | - | Entire type (GAP) | Wiki calls the type "in use". Needs a preset or a plain-tag editor |

Other gaps across types:
- The members (ways, stops, platforms, guideposts) and their roles are not preset fields in iD's relation presets. Role editing is needed in the member list; the presets only list tags. [iD, measured: presets have no `members` key.]
- No preset covers the `forward`/`backward` roles, the `route` role, or PTv2 stop and platform roles. Editors need a role check.
- The network levels (icn, ncn, rcn, lcn; iwn, nwn, rwn, lwn) are offered as combos without descriptions. The wiki only defines ncn and nwn explicitly [measured from Key:network summary]; the other levels are the wiki's pattern [inferred].

---

## 9. Open questions and where the wiki disagrees

1. Bus `name` format: PTv2 page says "contentious"; Tag:route=bus says invalid under PTv2. Ask before enforcing.
2. Forward/backward on bicycle routes: not called disputed on the pages, but the wiki gives no clear rule on when to use them versus `signed_direction` or section roles.
3. Shared ways across relations, split long routes at about 20 km, roundabouts on bus routes and ferry mapping: all called disputed on the Relation:route page.
4. Superroute nesting: current and older patterns both appear in the wiki; the US community dropped superroutes.
5. `network` on bicycle: Relation:route says required for `route=bicycle` but optional for `route=mtb`; the bicycle tag page says required. Agreed for `route=bicycle`.
6. Stop roles: `stop_entry_only` and `stop_exit_only` appear on the bus tag page but not the PTv2 page.
7. The Relation:route page's last part (about 8,800 characters) was not read. Nothing from it is in this file.

---

## 10. Measured vs inferred

Measured (from the fetched page summaries, or from the preset files):
- Required and recommended tags for each type; member roles named on each page; the deprecations named (`route=ncn` on ways, `symbol` to `osmc:symbol`, `pilgrimage` as value, `oneway` to `signed_direction`, `route=walking`, PTv1 roles); the iD preset fields and moreFields; the absence of a superroute preset; the network combo options (from fields.json).

Inferred (not stated on the pages as written):
- Level meanings for icn, rcn, lcn, iwn, rwn, lwn (the wiki defines only ncn and nwn explicitly).
- Route master rules beyond what the page states (no master inside a master; value match on vehicle).
- Superroute member checks (relations only is from the bicycle page; the others are inferred).
- The "warn on higher-class roads for foot routes" check.
- Draft help texts (written by this study, for review).

Caveat: every wiki statement above is a model summary of a page, not a copy of it. Verify any rule against the wiki page before it becomes a check or UI text.
