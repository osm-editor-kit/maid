# Climbing presets and fields in iD's tagging schema

Research date: 2026-11-12. Sources:
- Main: `openstreetmap/id-tagging-schema` at commit `9cb316ee8798834d97527acce9a2ee70eaa73031` (2026-11-10), cloned to `a local clone`.
- PR #2793 "Add additional fields to climbing presets" (open, head branch `elnappo:feature/climbing`, last updated 2026-11-02). File patches fetched with `gh api .../pulls/2793/files`, comments from `issues/2793/comments` and `pulls/2793/comments`.
- Older PRs and issues: #1113, #1590, #1591, #1596, #1597, #1598, #2152, #2475, #2912. The search for "climbing" was run with `is:pull-request` and `is:issue`.

Legend: **M** = on main, **PR** = added or changed by #2793, **inferred** = my reading, not run.

---

## 1. Presets

### 1a. On main

| Preset id | Name | Geometry | Tags / addTags | fields | moreFields | Notes | File |
|---|---|---|---|---|---|---|---|
| `climbing/crag` | Climbing Crag (name `{type/site/climbing/crag}`) | point | tags `climbing=crag`; addTags `sport=climbing`, `climbing=crag` | `name` | `website` | Point crag, no members | `data/presets/climbing/crag.json` |
| `climbing/route` | Climbing Route (name `{type/route/climbing}`) | line, point | tags `climbing=route`; addTags `climbing=route`, `sport=climbing` | `{climbing/route_bottom}` | `{climbing/route_bottom}` | Route line. Inherits all route_bottom fields by reference | `data/presets/climbing/route.json` |
| `climbing/route_bottom` | Climbing Route Start | point, vertex | tags `climbing=route_bottom`; addTags `sport=climbing`, `climbing=route_bottom` | `name`, `climbing/sport`, `climbing/trad`, `climbing/bolts` | `climbing/grade/uiaa`, `climbing/grade/french`, `climbing/grade/saxon`, `climbing/grade/yds_class`, `website`, `climbing/length`, `description` | Icon `temaki-abseiling`. Terms: climbing area, climbing crag, climbing point, rock climbing route, route bottom, route start, sport climbing | `data/presets/climbing/route_bottom.json` |
| `type/site/climbing/crag` | Climbing Crag (relation) | relation | tags `type=site`, `climbing=crag`; addTags `climbing=crag`, `site=climbing`, `sport=climbing`, `type=site` | `{climbing/crag}` | `{climbing/crag}` | Relation crag. Aliases "Climbing Cliff". `relation.reference` = `site`, member role `""` with matchTags `climbing=route` or `climbing=route_bottom` | `data/presets/type/site/climbing/crag.json` |
| `type/site/climbing/area` | Climbing Area | relation | tags `climbing=area`, `type=site`; addTags `climbing=area`, `site=climbing`, `sport=climbing`, `type=site` | `name` | `website` | Aliases "Climbing Region". Member role `""` with matchTags `climbing=crag`. `reference` is `climbing=crag` (see review points) | `data/presets/type/site/climbing/area.json` |
| `type/route/climbing` | Climbing Route (relation) | relation | tags `type=route`, `route=climbing`; addTags `climbing=route`, `route=climbing`, `sport=climbing`, `type=route` | `{climbing/route_bottom}` | `{climbing/route_bottom}` | Aliases "Boulder Problem", "Climb", "Mountaineering Route". No `relation` block, so no member constraints | `data/presets/type/route/climbing.json` |

Related but not `climbing=*` presets on main:
- `leisure/sports_centre/climbing` "Climbing Gym": tags `leisure=sports_centre`, `sport=climbing`, point and area. `data/presets/leisure/sports_centre/climbing.json`.
- `leisure/sports_centre/climbing_adventure` "Adventure Park": `sport=climbing_adventure`. `data/presets/leisure/sports_centre/climbing_adventure.json`.
- `playground/climbingwall`, `playground/climbingframe`: playground equipment, not climbing sites.
- `shop/outdoor`, `tourism/alpine_hut`: mention "climbing" only in terms.

There is no `climbing=route_top` preset and no `climbing=area` point preset on main. `grep -rn route_top data` returns nothing.

### 1b. Changed by PR #2793 (head as fetched 2026-11-12)

| Preset | PR change |
|---|---|
| `climbing/crag` | fields: `name`, `climbing/sport`, `climbing/boulder`, `climbing/trad`, `climbing/multipitch` (was `name`). moreFields: `description`, `website`, `covered`, `climbing/ice`, `climbing/mixed`, `climbing/dry`, `climbing/aid`. New terms: climbing cliff, climbing rock, climbing wall. New `removeTags`: `leisure=sports_centre` (added 2026-10-07, so crags are not drawn as gyms). |
| `climbing/route` | New `terms: ["{climbing/route_bottom}"]` and `aliases: ["{type/route/climbing}"]`. Fields unchanged. |
| `climbing/route_bottom` | fields: `name`, `climbing/sport`, `climbing/boulder`, `climbing/grade/hueco`, `climbing/trad`, `climbing/multipitch`, `climbing/pitches`, `climbing/grade/uiaa`, `climbing/grade/french` (9 values, limit is 10). moreFields: `description`, `climbing/length`, `climbing/bolts`, `climbing/grade/yds_class`, `climbing/grade/saxon`, `climbing/ice`, `climbing/mixed`, `climbing/dry`, `climbing/aid`, `climbing/grade/wi`, `climbing/grade/mixed`, `climbing/grade/dry`, `climbing/grade/aid`, `website`. Terms: removed "climbing area" and "climbing crag"; added "boulder problem", "bouldering", "climbing". New alias "Boulder Problem Start". Only the order of `addTags` changed. |

Preset ids are unchanged, so `type/site/climbing/crag`, `type/site/climbing/area` and `type/route/climbing` are not edited by the PR. They still pull in `climbing/crag` and `climbing/route_bottom` fields by reference (see 3).

---

## 2. Fields

### 2a. On main

| Field id (file) | Key | Type | Label | Options / details |
|---|---|---|---|---|
| `climbing/sport` (`data/fields/climbing/sport.json`) | `climbing:sport` | check | Sport climbing (bolted climbing) | none |
| `climbing/trad` (`trad.json`) | `climbing:trad` | check | Traditional climbing | none |
| `climbing/bolts` (`bolts.json`) | `climbing:bolts` | integer, min 0 | Number of Bolts | prerequisite `climbing:sport=yes` |
| `climbing/length` (`length.json`) | `climbing:length` | number, min 0 | Length (Meters) | none |
| `climbing/grade/french` (`grade/french.json`) | `climbing:grade:french` | combo, customValues, not case-sensitive | Grade (French) | `1`, `2`, `3-`, `3`, `3+`, `4a` to `10a`, with `+`/`b`/`c` steps. Placeholder `5c` |
| `climbing/grade/uiaa` (`grade/uiaa.json`) | `climbing:grade:uiaa` | combo, customValues | Grade (UIAA) | `1-` to `14-`, with `+`/`-` steps. Placeholder `6-` |
| `climbing/grade/saxon` (`grade/saxon.json`) | `climbing:grade:saxon` | combo, customValues, case-sensitive | Grade (Saxon) | Roman numerals `I` to `XIIIc`. Placeholder `VIIa` |
| `climbing/grade/yds_class` (`grade/yds_class.json`) | `climbing:grade:yds_class` | combo, customValues | Grade (YDS) | `5`, `5.1` to `5.9`, `5.10a` to `5.15d`. Placeholder `5.10a` |

### 2b. Added or changed by PR #2793

Only the files of the PR's head are listed here. The earlier author, inclination, hazard, family_friendly and beginner_friendly fields were removed during review (see 4).

| Field id (file) | Key | Type | Label | Change and detail |
|---|---|---|---|---|
| `climbing/sport` | `climbing:sport` | check → **defaultCheck** | Sport Climbing (Bolted Climbing) | strings: `undefined` → "No", `yes` → "Yes" |
| `climbing/trad` | `climbing:trad` | check → **defaultCheck** | Traditional Climbing | same strings |
| `climbing/bolts` | `climbing:bolts` | integer | Number of Bolts | prerequisite removed (it was `climbing:sport=yes`) |
| `climbing/length` | `climbing:length` | number | Length (Meters) | minValue 0 → 1 |
| `climbing/aid` (`aid.json`) | `climbing:aid` | **new** defaultCheck | Aid Climbing | strings No/Yes |
| `climbing/boulder` (`boulder.json`) | `climbing:boulder` | **new** defaultCheck | Bouldering | strings No/Yes |
| `climbing/dry` (`dry.json`) | `climbing:dry` | **new** defaultCheck | Dry-tooling | strings No/Yes |
| `climbing/ice` (`ice.json`) | `climbing:ice` | **new** defaultCheck | Ice Climbing | strings No/Yes |
| `climbing/mixed` (`mixed.json`) | `climbing:mixed` | **new** defaultCheck | Mixed Climbing | strings No/Yes |
| `climbing/multipitch` (`multipitch.json`) | `climbing:multipitch` | **new** defaultCheck | Multi-pitch Climbing | strings No/Yes |
| `climbing/pitches` (`pitches.json`) | `climbing:pitches` | **new** number, minValue 1 | Pitches | prerequisite `climbing:multipitch=yes` |
| `climbing/grade/french` | `climbing:grade:french` | unchanged options | Grade (French) | placeholder 5c → `6b+` |
| `climbing/grade/yds_class` | `climbing:grade:yds_class` | unchanged options | Grade (YDS) | placeholder 5.10a → `5.11a` |
| `climbing/grade/aid` (`grade/aid.json`) | `climbing:grade:aid` | **new** combo, customValues false, case-sensitive | Grade (Aid) | `A0` to `A5`. Placeholder `A3` |
| `climbing/grade/dry` (`grade/dry.json`) | `climbing:grade:dry` | **new** combo, customValues | Grade (Dry-tooling) | `D1-` to `D16+`. Placeholder `D8+` |
| `climbing/grade/hueco` (`grade/hueco.json`) | `climbing:grade:hueco` | **new** combo, customValues | Grade (Hueco / V-grade) | `VB−`, `VB`, `V0−`, `V0`, `V0+`, `V1` to `V18`. Placeholder `V6`. Prerequisite `climbing:boulder=yes`. The minus signs are Unicode U+2212 in the patch |
| `climbing/grade/mixed` (`grade/mixed.json`) | `climbing:grade:mixed` | **new** combo, customValues | Grade (Mixed) | `M1-` to `M16+`. Placeholder `M8+` |
| `climbing/grade/wi` (`grade/wi.json`) | `climbing:grade:ice` | **new** combo, customValues | Grade (Water Ice) | `WI1-` to `WI7+`. Placeholder `WI3+`. File name says `wi`, key says `ice` |

Field ids come from the file path, so the id is `climbing/grade/wi` while the key is `climbing:grade:ice`.

Not in the PR, with `climbing:` keys seen in discussion: `climbing:routes` (number of routes on a crag), `climbing:rock` (removed, see 4), `climbing:author` (removed), `climbing:hazard:*` (removed), `climbing:family_friendly` and `climbing:beginner_friendly` (removed).

---

## 3. How routes and crags relate

Nothing in the schema defines `route_top`, and the PR does not add it. In the presets all relation member roles are the empty string `""`. The `role_labels` are `{"": ""}`. Membership is matched by tags, not by roles such as start or top.

| OSM object | Tags | iD preset | Geometry | Members |
|---|---|---|---|---|
| Route start (node or vertex on the route) | `climbing=route_bottom`, `sport=climbing` | `climbing/route_bottom` | point, vertex | none |
| Route line | `climbing=route`, `sport=climbing` | `climbing/route` | line, point | none. Fields inherited from route_bottom |
| Route relation | `type=route`, `route=climbing`, `climbing=route` (addTags) | `type/route/climbing` | relation | not constrained in the preset |
| Crag, point | `climbing=crag`, `sport=climbing` | `climbing/crag` | point | none |
| Crag, relation | `type=site`, `site=climbing`, `climbing=crag` | `type/site/climbing/crag` | relation | `site` relation, members with role `""` and matchTags `climbing=route` or `climbing=route_bottom` |
| Area, relation | `type=site`, `site=climbing`, `climbing=area` | `type/site/climbing/area` | relation | `site` relation, members with role `""` and matchTags `climbing=crag` |
| Climbing gym (not a crag) | `leisure=sports_centre`, `sport=climbing` | `leisure/sports_centre/climbing` | point, area | none. The PR's crag preset removes `leisure=sports_centre` |

Hierarchy on main: area (relation) → crag (relation or point) → routes (line, relation, or route_bottom nodes). The area's members are crags only. The crag's members are routes or route starts.

Fields are shared by reference (SCHEMA.md line 155: a `{preset}` in `fields` or `moreFields` extends the other preset's fields). So changes to `climbing/crag` and `climbing/route_bottom` also reach `type/site/climbing/crag`, `climbing/route`, `type/route/climbing` (inferred from the reference rule, not run in iD).

Counts for crags and routes: #1597 gives 5,868 uses of `climbing=crag` and #1598 gives 2,057 uses of `climbing=route`. Both figures are from the PR bodies. The PR #2793 comment from elnappo (2026-09-14) gives a query for `nwr["climbing"="crag"]["climbing:routes"]` and examples. The number of routes is either `climbing:routes=<int>` or a count in the `climbing=crag` value itself. The wiki's "yes / no / <amount of routes>" style for climbing styles is the source of this question.

---

## 4. Open review points in PR #2793

Status as of the PR's last update (2026-11-02). Elnappo asked on 2026-11-02 "Anything missing here or something I can do to get this merged?". No maintainer reply is in the comments after that.

1. **Value model: yes/no or a number.** The wiki lists `yes / no / <amount of routes>` for climbing styles. tordans (2026-09-08) asked what the number means and asked for Postpass evidence that the PR's fields really are yes/no. elnappo replied on 2026-09-14 with taginfo counts: `climbing:sport` yes 10,217 and other 803; `climbing:trad` yes 6,069 and other 583; `climbing:boulder` yes 4,763 and other 110. He also asked whether `"customValues": true` should be added. The PR head has no `customValues` on the style fields. Unresolved.
2. **check vs defaultCheck.** matkoniecz (2026-09-10) asked why sport and trad changed to defaultCheck, since the wiki lists `no` as valid. elnappo's 2026-09-16 comment says "Climbing styles are now `type: check` again", but the PR head shows defaultCheck on sport, trad, boulder, ice, mixed, multipitch, dry and aid. The comments and head disagree, and the head is what the patch shows. tordans (2026-09-11) asked for translated `undefined` strings. zbycz (2026-09-16) asked for "not relevant" or "doesn't apply" instead of "Unknown or not relevant". The head uses "No". Unresolved.
3. **Removed tags.** `climbing:hazard:*` removed (2026-09-14). tordans suggested moving number-valued hazards such as `6b` or "first anchor at 3 m" to other keys. `climbing:family_friendly` and `climbing:beginner_friendly` removed (matkoniecz, elnappo 2026-09-02). `climbing:author` removed (2026-10-07), though tordans (2026-09-11) thought it fine. `climbing:inclination` removed (2026-10-07). Removed items are not in the head patch.
4. **`climbing:rock` vs `material`.** The field was removed from the PR. elnappo and matkoniecz (2026-09-08 to 09-10) say `material` already covers the values. Matkoniecz offered a bot migration. tordans suggested a voting RFC. Postpass counts in the comment: `climbing:rock` with sport 7,298, `rock` with sport 3,298, `material` with sport 2,804. Deferred.
5. **Help text (info-i) for aid and dry.** The wiki data items Q23971 (`climbing:aid`) and Q23972 (`climbing:dry`) did not show in the test environment (tordans, 2026-09-08 and 09-11). Andrewharvey pointed out that Key:climbing:aid is empty. elnappo could not set the sitelinks because of operations issue #1400. He said on 2026-09-25 that the missing sitelinks were added. Not confirmed in the test docs. Matkoniecz said the help text comes from data items (2026-09-03).
6. **Hueco grade.** Label "Grade (Hueco / V-grade)" with prerequisite `climbing:boulder=yes`. tordans (2026-09-11) asked for a label with "Bouldering". matkoniecz (2026-09-02) says the wiki calls hueco US-specific. elnappo says it should be worldwide, since French and Hueco are the two main bouldering systems.
7. **Mixed and ice.** tordans (2026-09-01) asked whether `climbing:mixed` means ice plus rock and whether those routes are seasonal. elnappo says "mixed" is the usual term and that some routes are seasonal. The `climbing:ice` field and the `climbing:grade:ice` key (file `grade/wi.json`) use the same word for the style and the grade.
8. **Placeholders.** French 5c → 6b+, YDS 5.10a → 5.11a, and new placeholders for the new grade fields. No discussion recorded.
9. **Field limit.** Main build error at head 2026-09-08: "11 values in fields of climbing/route_bottom. Limit: 10". The limit is `maxFieldsBeforeError = 10` in `scripts/lib/build.ts` line 1004. Fields with a `prerequisiteTag` or `geometry` are not counted. The PR head has 9 `fields` on route_bottom, so it passes (counted by reading the patch, not by running the build).
10. **Terms order.** The lint error quoted by elnappo on 2026-10-07 expects `climbing` before `climbing point`. The PR head has `climbing point` before `climbing`. Inferred: the check fails at head. I did not run it.
11. **Bolts prerequisite removed.** `climbing:bolts` is no longer tied to `climbing:sport=yes` and sits in moreFields. No discussion recorded.
12. **Unicode minus in hueco options.** `VB−`, `V0−` use U+2212. Not discussed. Likely fine if the editor shows them, but it differs from the other grade lists.
13. **Test documentation.** The PR body has the test-documentation template. Test links were posted (e.g. 2026-09-11 and 2026-09-14 comments, with a test URL for crag `n13397242762`). Screenshots of the sidebar and info-i for all fields are not in the thread. tordans asked for them on 2026-09-08 and 09-11.

Related, not in the PR:
- #2152 (open): "verify whether route=climbing should be supported". Its taginfo link shows `route=climbing` projects as suspect. This bears on `type/route/climbing` and its `route=climbing` tag.
- #2475 (closed): crag and gym mis-tagging, which the crag `removeTags` addresses.
- #2912 (closed 2026-09-22): `climbing:bolts` made an integer. Matches main's `bolts.json`.
- #1113 (closed, zbycz): first climbing presets. Its "Climbing terminology" taxonomy (area, crag, route, route start and top) is the source of the top/start idea. Route top was not carried into the schema.
- #1590, #1596, #1597, #1598 (closed in 2025-06; main has their presets): route start, area, crag and route. #1597 and #1598 explain the design choice of putting fields on the route start node and leaving crag and area statistics to be computed from members.
- #1591 (closed): umbrella "Add climbing features".

---

## What I found, measured vs inferred

Measured (read or run here):
- Preset and field lists on main, and their content (files cited above).
- PR #2793's file list (23 files) and patches, fetched 2026-11-12.
- PR comments and the closed PRs' bodies.
- The field limit of 10 and where it is set (`scripts/lib/build.ts`).

Inferred (read, not run):
- Field inheritance by `{preset}` reference reaches the relation presets and the route presets.
- The terms order error at head.
- The removed gym tag in the crag preset is the intent of `removeTags`.

Not done:
- I did not run `bun run check`, the build, or the iD preview. The PR's preview link was not opened.
- I did not check taginfo or Postpass. Counts come from the PR comments and are marked as theirs.
- Unsure: whether the head's defaultCheck choice is the final one (2. above). Also whether the removed `climbing:author`, `climbing:inclination` and hazard tags are final.
