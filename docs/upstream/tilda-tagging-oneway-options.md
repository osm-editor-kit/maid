# Draft for `@tilda-geo/bicycle-infrastructure-tagging`: oneway values by context

For: `FixMyBerlin/tilda-schemas`, `packages/bicycle-infrastructure-tagging/src/requirements/required-attributes.ts`
(rule `oneway`, today `options: ['yes', 'no', '-1']`, `assumedOptions: ['no']`). Maid works around it in
`packages/module-tilda/src/cards.ts` (`onewayChoices`) until the package has it.

## Problem

The checklist offers `yes`, `no` and `-1` for the direction of a way of its own (Tobias, 2026-11-11, in Maid's TILDA
section). `-1` on a separate geometry is never wanted: a cycleway ridden against its line is reversed instead. On a
road side the package offers only `no`, so the one real case for a direction on a side has no answer: a lane on the
left of a two-way road that is ridden in the line's direction (`cycleway:left:oneway=yes`). The values also come
without words, so a mapper has to know what `-1` means relative to the line.

Background, as tilda-geo's campaign "Fahrtrichtung der Radinfrastruktur prüfen" (branch
`claude/tilda-oneway-processing-81b448`, commit `698d54a5d`) sums up the wiki
([DE:Key:cycleway:right:oneway](https://wiki.openstreetmap.org/wiki/DE:Key:cycleway:right:oneway)):
`yes` with the line, `-1` against it, `no` both ways; without a tag, a two-way road has right `yes`, left `-1`; a
one-way road has both sides `yes`, the contraflow lane `-1`.

## Proposal

1. `options` of the oneway rule become a function of the context:
   - `side === 'self'`: `['yes', 'no']`
   - a road side: `['no']`, plus `yes` on the left side when `sideOnewayDefault(tags, 'left') === '-1'`
2. A text per value and context, in `requirements/texts.ts` (German and English), for example
   `ONEWAY_VALUE_TEXTS[lang][meaning]` with `label` and `hint`:
   - `with_line`: "nur in Linienrichtung" / "Radverkehr fährt nur in Zeichenrichtung dieses Wegs. Fährt er
     andersherum, drehe den Weg um, statt -1 zu taggen."
   - `both`: "beide Richtungen" / "Radverkehr darf hier in beide Richtungen fahren."
   - `left_with_line`: "links, in Linienrichtung" / "Nur wenn die Radinfrastruktur links an der Fahrbahn liegt und
     trotzdem in Zeichenrichtung der Straßenlinie befahren wird, also wie der Verkehr auf der rechten Seite. Ohne
     Angabe gilt links -1 (gegen die Linienrichtung), das stimmt fast immer."
3. `RequiredAttribute` gets the meaning per option (`optionMeanings?: Record<string, string>`), so an editor can show
   the words without knowing the rule.
4. Tests: a separate cycleway offers no `-1`; the left side of a two-way road offers `no` and `yes`; the left side of
   a one-way road and the right side offer `no` only.

When the package has it, Maid drops `onewayChoices` and reads the options and meanings from the attribute.
