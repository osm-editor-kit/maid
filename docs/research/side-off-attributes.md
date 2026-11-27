# Attributes that stay valid on a side that is off

Date: 2026-11-27. Read-only research for the Tags sheet (`packages/ui/src/sheet/tags/tag-sides.ts`, `side-off-attributes.json`).

## Question

On a road the side keys `parking:<side>`, `cycleway:<side>` and `sidewalk:<side>` can say the side is off: `no`, `none` (nothing there) or `separate` (mapped as its own way or area). The sheet locks the other attributes of such a side (`<group>:<side>:<suffix>`) and marks a leftover value as an error. Which suffixes stay valid, per group and value?

## Answer

Suffixes as they follow `<group>:<side>:`. Entries marked `*` are inferred or a Maid decision, not read in a source (see the tables).

```json
{
  "parking": {
    "no": [
      "restriction",
      "restriction:conditional",
      "restriction:reason",
      "restriction:reason:conditional",
      "reason",
      "reason:conditional",
      "restriction:motorcar",
      "restriction:motorcar:conditional",
      "restriction:passenger_car",
      "restriction:passenger_car:conditional",
      "restriction:disabled",
      "restriction:disabled:conditional",
      "restriction:car_sharing",
      "restriction:car_sharing:conditional",
      "restriction:motorcycle",
      "restriction:motorcycle:conditional",
      "restriction:goods",
      "restriction:goods:conditional",
      "restriction:hgv",
      "restriction:hgv:conditional",
      "restriction:bus",
      "restriction:bus:conditional",
      "restriction:tourist_bus",
      "restriction:tourist_bus:conditional",
      "restriction:coach",
      "restriction:coach:conditional",
      "restriction:psv",
      "restriction:psv:conditional",
      "restriction:taxi",
      "restriction:taxi:conditional",
      "restriction:motorhome",
      "restriction:motorhome:conditional",
      "restriction:emergency",
      "restriction:emergency:conditional",
      "restriction:delivery",
      "restriction:delivery:conditional",
      "restriction:agricultural",
      "restriction:agricultural:conditional",
      "restriction:forestry",
      "restriction:forestry:conditional"
    ],
    "none": [
      "restriction",
      "restriction:conditional",
      "restriction:reason",
      "restriction:reason:conditional",
      "reason",
      "reason:conditional",
      "restriction:motorcar",
      "restriction:motorcar:conditional",
      "restriction:passenger_car",
      "restriction:passenger_car:conditional",
      "restriction:disabled",
      "restriction:disabled:conditional",
      "restriction:car_sharing",
      "restriction:car_sharing:conditional",
      "restriction:motorcycle",
      "restriction:motorcycle:conditional",
      "restriction:goods",
      "restriction:goods:conditional",
      "restriction:hgv",
      "restriction:hgv:conditional",
      "restriction:bus",
      "restriction:bus:conditional",
      "restriction:tourist_bus",
      "restriction:tourist_bus:conditional",
      "restriction:coach",
      "restriction:coach:conditional",
      "restriction:psv",
      "restriction:psv:conditional",
      "restriction:taxi",
      "restriction:taxi:conditional",
      "restriction:motorhome",
      "restriction:motorhome:conditional",
      "restriction:emergency",
      "restriction:emergency:conditional",
      "restriction:delivery",
      "restriction:delivery:conditional",
      "restriction:agricultural",
      "restriction:agricultural:conditional",
      "restriction:forestry",
      "restriction:forestry:conditional"
    ],
    "separate": []
  },
  "cycleway": {
    "no": [],
    "none": [],
    "separate": [
      "lane"
    ]
  },
  "sidewalk": {
    "no": [],
    "none": [],
    "separate": []
  }
}
```

The 17 vehicle classes are TILDA's `vehicle_classes.lua`. `parking.none` has the same list as `no` (inferred). The vehicle list is open in OSM (`restriction:*`); a prefix match `restriction:*` may be simpler than the list.

## Per entry

### parking, `no`

| Suffix | Status | Reason, source |
| --- | --- | --- |
| `restriction`, `restriction:conditional` | read | The wiki pairs `parking:<side>=no` with `restriction=no_parking|no_stopping|no_standing` (legal ban). https://wiki.openstreetmap.org/wiki/Street_parking (also `DE:Street_parking`). TILDA reads both for every side: `processing/topics/parking/helper/classify_parking_conditions.lua` l. 150-154, and its own example `parking:left=no` + `parking:left:restriction=no_stopping` in `parkings/helper/result_tags.lua` l. 17-30. |
| `restriction:reason`, `restriction:reason:conditional` | read | Wiki: legal reason of a signed restriction. TILDA l. 157-158 of the same file. |
| `reason` | read | Wiki: physical reason why there is no parking (`parking:left=no` + `parking:left:reason=narrow`). TILDA `sanitize_parking_tags.lua` `reason` (19 values). |
| `reason:conditional` | read in TILDA only | `classify_parking_conditions.lua` l. 156. Not named on the wiki pages I could read. |
| `restriction:<vehicle>`, `restriction:<vehicle>:conditional` | read | Wiki examples `restriction:hgv`, `:taxi`, `:bus`. TILDA l. 186-187 with `vehicle_classes.lua`. |
| `*` `none` | inferred | The wiki only knows `no`; TILDA's `parking_extended` accepts `no`, not `none`. Maid's `SIDE_OFF` treats `none` like `no`. Same list as `no` is the safe reading. |

### parking, `separate`

Empty. Read: the wiki says that with `parking:<side>=separate` the properties (`orientation`, `fee`, `access`, `restriction`) belong on the separate `amenity=parking` areas, not on the centreline. TILDA reads the same attributes from the centreline for every side value and does not gate by `separate`, so TILDA does not contradict an empty list but also does not forbid anything.

### cycleway

| Entry | Status | Reason, source |
| --- | --- | --- |
| `no`, `none`: `[]` | read, weak | https://wiki.openstreetmap.org/wiki/Key:cycleway and `DE:Key:cycleway` name no sub-key for `no`. `none` is not mentioned on either page. TILDA's `separate_geometry`-style handling (`bikelane_categories.lua` l. 91-100) only looks at `cycleway=separate|no`, not at sub-keys. |
| `separate`: `[]` for attributes | read | Key:cycleway "Supplementary details": surface, width and so on go on the separate way without the `cycleway:` prefix. |
| `*` `separate`: `lane` | Maid decision, not on the wiki | Wiki documents `cycleway:<side>:lane` only with `cycleway=lane`. Maid's `ROAD_ONLY` (`packages/module-sidepaths/src/side-tags.ts`, and `docs/research/sidepaths.md` l. 49) keeps `lane` on the road because of a painted advisory lane next to a separate track (Alexanderstraße, medium fixture). I did not re-check that fixture. |

### sidewalk

| Entry | Status | Reason, source |
| --- | --- | --- |
| `no`, `none`: `[]` | read | Key:sidewalk and `DE:Key:sidewalk` tie no sub-key to `no`/`none`. |
| `separate`: `[]` | read | Key:sidewalk "Additional tags": properties of a separately mapped sidewalk go on that way, "not using the above tags on the carriageway". This includes `kerb`, `surface`, `width`, `traffic_sign`, `bicycle`. |
| `*` `kerb` | open | Maid's `ROAD_ONLY` keeps `kerb` on the road ("a road side's kerb is mapped at crossings"). The wiki lists `sidewalk:both:kerb` as a sidewalk attribute and says the opposite for `separate`. TILDA does not read it. Left out of the answer; add `kerb` to `sidewalk.separate` only if Tobias wants the sheet to agree with `ROAD_ONLY`. |

## Meta keys

Inferred, with one read point. A meta key on the side key itself (`source:parking:left`, `note:cycleway:right`, `fixme:sidewalk:left`, `check_date:...`) describes the `no` or `separate` value and stays valid. None of the wiki pages names them (searched: `source`, `note`, `check_date`: not mentioned on Key:sidewalk, Key:cycleway, Street_parking). TILDA treats `source:` and `note:` in front of `cycleway|sidewalk:<side>` as meta of the side (`roads_bikelanes/bikelanes/transformations.lua` l. 20-30, 150, `metaPrefixes`; `source:cycleway:left` unnests to `source`). A meta key with a suffix (`source:cycleway:left:width`) describes that attribute and is valid exactly when the attribute is. In Maid's pattern check the side key's own metas are matched by the empty suffix (`allowedWhenOff` returns true), which fits.

## Unsure

- Wiki pages fetched in parts: Street_parking and DE:Street_parking each cut at 100,000 characters. `:source`/`:note` were not seen in the part read. The summary of the fetch tool is a model summary, not a verbatim read.
- `parking:<side>:reason:conditional`, `restriction:reason:conditional` for `no`: used by TILDA, not confirmed on the wiki.
- `parking:<side>=separate` with a restriction (the wiki's marked-area workaround uses `parking:<side>:parking=separate` plus `parking:<side>:restriction`, a different key). Treated as not valid for `separate`.
- `cycleway:<side>:lane` next to `separate` and `sidewalk:<side>:kerb`: Maid choices, no wiki support.
- Not looked at: `cycleway:<side>:traffic_sign` with `no`/`separate`. The wiki lists `traffic_sign` for sidewalks and cycleways in general but not for `no`/`separate`. A sign with a separate track (DE:237 on the road side) is plausible; treated as an attribute of the separate way.
- Not checked: iD's field and validation behaviour for these keys.

## Adopted (2026-11-27)

`packages/ui/src/sheet/tags/side-off-attributes.json` takes this answer with prefix entries: parking `no` and `none` allow `restriction`, `restriction:*`, `reason`, `reason:*` (the vehicle classes, `:conditional` and `:reason` are below them); cycleway `separate` allows `lane`. The open doubts (`sidewalk:<side>:kerb` with `separate`, `cycleway:<side>:traffic_sign`) are left out until Tobias decides.

Tobias, 2026-11-27: `none` is the same as `no`. `cycleway:<side>:lane` with `separate` is not allowed after all: in the fixtures (Alexanderstraße w112128422, Memhardstraße, Grunerstraße) it is a `:lane` left over from a painted lane after the side was set to `separate`, an error to clean up. `sidewalk:<side>:kerb` with `separate` and `cycleway:<side>:traffic_sign` with `no` or `separate` stay out.

Decided by Tobias, 2026-11-27: tagging errors, not supported: `sidewalk:<side>=separate` with `sidewalk:<side>:kerb`; `cycleway:<side>=no` with `cycleway:<side>:traffic_sign`; `cycleway:<side>=separate` with `cycleway:<side>:traffic_sign` or `cycleway:<side>:lane`. With `separate` the attributes belong on the separately mapped way.
