# Fields: iD's sidebar against Maid today

Compared at iD commit `0194f3926` (`git -C .reference/id rev-parse --short HEAD`) and id-tagging-schema 6.19.2 (the version in `packages/presets/node_modules`). Schema counts come from `dist/fields.min.json`: 744 fields, 29 types.

iD paths: `fields/…` is `.reference/id/modules/ui/fields/…`, `ui/…` is `modules/ui/…`, other paths are under `.reference/id/modules/`, and `data/…` and `css/…` are under `.reference/id/`. Maid paths: `fields.tsx` and `logic.ts` are in `packages/ui/src/inspector/`, `presets.ts` in `packages/presets/src/`. Anything not read in the source is marked **(inferred)**.

Sizes: S is about an hour, M one to two hours, L more than two hours (split it). "Network" means the field calls a service outside the repo; automation must not do that (AGENTS.md rule 1).

## 1. Table

| Type | Count | iD file | Maid today | Size |
| --- | --- | --- | --- | --- |
| combo | 277 | `fields/combo.js` | basic text with a datalist | M |
| check | 113 | `fields/check.ts` | field component `Check.tsx`: three states, unset shows as mixed (2026-10-13) | S |
| number | 65 | `fields/input.js` | field component `Number.tsx` with `number-logic.ts` (2026-10-13; steppers and clamping not checked) | M |
| text | 51 | `fields/input.js` | done for plain text (draft, Enter, blur, Escape, trim) | S |
| semiCombo | 50 | `fields/combo.js` | field component `Multi.tsx` with `multi-logic.ts` (2026-10-13) | M |
| typeCombo | 48 | `fields/combo.js` | basic: as combo, without the "yes" rule | S |
| radio | 36 | `fields/radio.js` | field component `Radio.tsx` with `radio-logic.ts` (2026-10-13) | M |
| multiCombo | 18 | `fields/combo.js` | field component `Multi.tsx`; the `payment:` write is fixed (`multi-logic.ts:117-122`, 2026-10-13) | M |
| identifier | 12 | `fields/input.js` | basic text, no outlink button | S |
| localized | 9 | `fields/localized.js` | field component `Localized.tsx` with `localized-logic.ts` (2026-10-13) | L |
| defaultCheck | 7 | `fields/check.ts` | `Check.tsx`: unset is unchecked, no "No" (`logic.ts:193`, 2026-10-13) | S |
| textarea | 7 | `fields/textarea.js` | basic, wrong: one-line input | S |
| wikidata | 6 | `fields/wikidata.js` | none: plain text | M, network |
| date | 5 | `fields/input.js` | field component `DateColour.tsx` (2026-10-13) | S |
| url | 4 | `fields/input.js` | basic text, no open button | S |
| manyCombo | 4 | `fields/combo.js` | none: rows of keys | S |
| directionalCombo | 4 | `fields/directional_combo.js` | none: base key only | M |
| roadspeed | 4 | `fields/roadspeed.js` | basic number text, no mph | S |
| roadheight | 4 | `fields/roadheight.js` | basic number text, no ft/in | S |
| structureRadio | 3 | `fields/radio.js` | basic, wrong control (as radio) | L |
| address | 3 | `fields/address.js` | field component `Address.tsx` with `address-logic.ts` (2026-10-13) | L |
| tel | 3 | `fields/input.js` | basic text; the multi-key `keys` are ignored | S |
| colour | 3 | `fields/input.js` | field component `DateColour.tsx` (2026-10-13) | S |
| onewayCheck | 2 | `fields/check.ts` | basic select; no reverse button | M |
| networkCombo | 2 | `fields/combo.js` | basic (datalist); no taginfo | S, network |
| wikipedia | 1 | `fields/wikipedia.js` | none: plain text | M, network |
| restrictions | 1 | `fields/restrictions.js` | none; writes relations, not tags | L, decision |
| access | 1 | `fields/access.js` | field component `Access.tsx` (2026-10-13) | M |
| email | 1 | `fields/input.js` | basic text | S |

Not in schema 6.19.2 (iD keeps them, Maid does not need them yet): `integer`, `schedule` (both alias `uiFieldText`, `input.js:18-27`), `cycleway` (a fallback to `directionalCombo`, `directional_combo.js:16-23`).

Universal fields: 21 (`localized` 7, `identifier` 4, `url` 2, `date` 2, `number` 1, `wikidata` 1, `wikipedia` 1, `textarea` 3). Schema properties that Maid's `Field` type does not carry yet: `snake_case` (44 fields set false), `caseSensitive` (33 true), `customValues` (79 false), `autoSuggestions` (125 set, 120 false), `pattern` and `urlFormat` (10 each), `maxValue`, `locationSet` (31), `usage` (10), `reference` (15), `icons` (13), `stringsCrossReference` (37), `default` (10), `increment` (4 set; iD defaults to 1 for numbers, `presets/field.ts:61`).

## 2. Shared behaviour in iD

**Label row** (`field.js:156-215`). Each field has a label. Two buttons sit on it:
- The remove button (trash icon) deletes every key of the field (`field.js:142-155`, sets all keys to undefined). It is visible when the row has class `present` and is not locked (`css/80_app.css:1483-1490`).
- The revert button (undo icon) dispatches `revert` with the current and original keys (`field.js:117-139`); the caller restores the base values (inferred, not read). It is visible when the row has class `modified` and is not locked (same CSS lines).
- `modified` means some key differs from the base graph (`field.js:73-90`). `present` means some key has a value (`field.js:93-114`). For `multiCombo` a key matches by prefix (`:95-101`); for `localized`, any `key:<lang>` matches (`:103-111`).

**Info button** (`field.js:232-240`, `ui/tag_reference.js:20-36`, `:110-170`). Every field gets a reference button unless it is turned off. It loads on the first click from the OSM wiki (`services.osmWikibase`) or from Wikidata (`qid`). Network. Maid: decision needed (see build order); it is not needed for the fields themselves.

**Placeholder** (`fields/input.js:560`, `combo.js:527-560`, `radio.js` none). When the value is mixed: "Multiple Values" (`inspector.multiple_values`). Otherwise the field's placeholder, or "Unknown" (`inspector.unknown`, `data/core.yaml:747`) for text, or the first option labels (under 20 characters, at most three, then "…") for combos. Maid has no mixed values yet (one feature at a time), so only the placeholder part applies.

**Empty input removes the tag.** Text fields write `val || undefined` (`input.js:487`). The guard "do not override several values with an empty string" (`input.js:456`) matters only for mixed values.

**Cleaning.** Every change on blur or on Enter goes through `context.cleanTagValue` (`fields/input.js:449-456`, `core/context.ts:406`), which is `utilCleanOsmString` (`util/util.ts:730-745`): trim, Unicode NFC, cut to 255 characters (`core/context.ts:402`, `maxCharsForTagValue`). While typing (`onInput`) the value is not cleaned. Maid trims but does not normalise or cut (`ui/src/inspector/logic.ts:8-12`). Check whether the model cuts values elsewhere before adding it to the field (not read).

**Live update.** iD writes on the `input` event as well (`input.js:107`, `change(true)`), so the tag list and the map follow while typing. Maid writes on blur and Enter (`fields.tsx:47-71`).

**Length indicator** (`ui/length_indicator.js:12-45`). A counter appears in the field; it turns to a warning at the limit ("max length reached"). Not in Maid.

**Locked fields** (`input.js:57-72`, `localized.js:76-105`). `brand`, `network`, `operator`, `flag` are read-only when the feature has `*:wikidata` (or is linked to Wikidata). `name` is read-only when the feature has `name:etymology:wikidata` or when the preset sets a name or `brand:wikidata`. The row gets class `locked`, a lock icon and a tooltip (`field.js:315-320`, `:268-290`). The rule is data-only, no network. Not in Maid.

**Prerequisite tags** (`field.js:342-388`). A field with `prerequisiteTag` is allowed only when the tag holds. A field whose key already has a value is always allowed (`field.js:358-360`). Maid does the same in `presets/src/presets.ts:88-97` and `:494-510`.

**Geometry** (`field.js:342-350`, `preset_fields.js:72-78`). A field with `geometry` is allowed only when every selected feature has that geometry. Maid: `presets.ts:105-107`.

**Which fields show by default** (`sections/preset_fields.js:63-99`, `form_fields.js:16-51`):
- Fields in the preset's `fields` list show at once. Fields in `moreFields` and universal fields are listed under "Add field:" (`form_fields.js:54-70`, label `inspector.add_fields`, `data/core.yaml:769`).
- A listed field becomes shown when a tag of it is set (`field.js:299-313`) or when the user picks it from the list (`form_fields.js:112-118`, `field.js:322-333`).
- The "Add field" list is sorted by title, with universal fields last (`preset_fields.js:87-90`, `form_fields.js:19-20`). Each entry searches by label and terms (`form_fields.js:59-61`).
- Shown fields are ordered as in the preset (`form_fields.js:46-51`).
- Showing a field with `default` sets the tag to the default when its value is not already the default (`field.js:322-333`; 10 fields have a default). Shown from the list, this also replaces a different value.
- Maid: `presets.ts:496-518` adds `moreFields` and universal fields only when they have a value. There is no "Add field" list at all. Also Maid hides keyless fields (`access`, `address`) until a key has a value (`fields.tsx:281`), while iD shows them when the preset lists them.

**Keyboard in combos** (`ui/combobox.js:186-235`, `:336-372`). Tab accepts the highlighted or typed value. Enter accepts and, in multi and semi combos, blurs (`combo.js:739-742`). Up and Down move through the list and open it. Escape closes the list (on key up) and cancels. The typed text autocompletes inline to the first suggestion that starts with it, except numbers (`combobox.js:341-372`).

## 3. Field types

### 3.1 text, url, email, tel, identifier, date, textarea, colour (text family)

- **text** (51). An `input`, no type change. Written on blur, Enter, or change: trimmed and cleaned, empty removes the tag (`fields/input.js:449-488`). The value is not split on `;`.
- **url** (4). A text input with an open button on the right (`input.js:222-238`). The button opens the URL in a new tab and is enabled only when the value is a valid URL (`getExternalLink`, `input.js:396-416`, `utilIsValidURL`). Click only; automation never clicks it.
- **email** (1). Native `type=email` (`input.js:97`). No validation beyond the browser.
- **tel** (3). Native `type=tel`. The placeholder is the phone format of the feature's country from `phone_formats` (`input.js:47-51`, `:370-388`). Local data (iD's `data/phone_formats.json`), not network. The field has `key` and `keys` (for example `phone` and `contact:phone`). On change, the value goes to the key that already has a value among `keys`, else to `key` (`input.js:492-498`).
- **identifier** (12). Plain text. If the field has `urlFormat` and `pattern` (10 fields, for example `wikimedia_commons`, `mapillary`, `fhrs:id`), an outlink button builds the URL from the first match of the pattern, or uses the value if it is already a URL (`input.js:176-200`, `:396-416`). Click only.
- **date** (5: `start_date`, `opening_date`, `check_date`, `survey:date`, `wreck:date_sunk`). Text plus a native date picker (`input.js:244-250`, `updateDateField` at `:301-349`). The value must match `^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$` (`input.js:302-303`). For `check_date` and `survey:date` a "set today" button shows when the date is not today (`input.js:311-324`). The calendar button is hidden on Safari (`input.js:333`).
- **textarea** (7: `note`, `label`, `inscription`, `fixme`, `description`, `comment`, `defibrillator:location`). A multi-line `textarea` (`fields/textarea.js:34-41`), written on blur and change, same cleaning. Maid renders it as a one-line input (`fields.tsx:224`, `:79`), so a line break cannot be typed.
- **colour** (3: `colour`, `roof:colour`, `building:colour`). Text plus a colour swatch that opens the native colour picker (`input.js:252-290`). The swatch shows a pen icon when empty, and disappears when the text is not a valid colour (`isColorValid`, `input.js:258`). Picking a colour writes its hex value.

Edge cases to test: leading and trailing spaces are removed; empty removes the tag; a value longer than 255 characters is cut; text with `;` stays one value; `tel` with `phone` set writes `phone`, not `contact:phone`; a date with 2024-1 is rejected by the picker and the button; a colour name that is not valid leaves the swatch out.

### 3.2 number, roadspeed, roadheight

- **number** (65). Text input with two steppers, minus and plus (`input.js:116-175`). Step = `field.increment`, which defaults to 1 (`presets/field.ts:61`); four fields set 5 (`direction` twice, `camera:direction`, `deflection`). The steppers act on each `;`-separated value. For direction fields a compass word is accepted (N, NE, ...; `input.js:150-152`), and the result wraps into 0 to 359 (`:163-166`). The steppers are disabled when the value has no number (`:563-576`) and when the values are mixed (`input.js:142`). Values are clamped to `minValue` (51 fields, mostly 0 or 1; `input.js:418-427`). Typed values use the locale's number format (`localizer.floatParser`, `:449-487`); a value written in raw form (`likelyRawNumberFormat`, `input.js:27`, dot decimal) keeps its decimal count. Stored as a plain number string.
  - Maid: `NumberField` is a text input with `inputMode=decimal` and a `step` attribute (`fields.tsx:93-110`). No steppers, no clamping, no locale parsing; the text is stored as typed.
  - Edge cases: `-1` and `0` with minValue 0; `1,5` in a German locale; the steppers after a value like `12;14`; compass word `NE` with the direction step.
- **roadspeed** (4: `minspeed`, `maxspeed`, `maxspeed:hgv`, `maxspeed:advisory`). A number input and a unit input (`km/h` or `mph`, `roadspeed.js:22-67`). The default unit comes from the country of the feature (`countryCoder.roadSpeedUnit`, `roadspeed.js:57`; bundled data, no network). Metric suggestions are 20 to 120 in steps of 10, imperial 5 to 80 in steps of 5 (`roadspeed.js:25-26`, `:89-92`). Imperial values are written as `<n> mph` (`:117-121`); metric as a plain number. A value with `mph` in it selects the imperial unit when shown (`:128-...`).
  - Maid: a plain number text input (`NumberField`). No unit.
- **roadheight** (4: `maxheight`, `maxwidth`, `maxlength`, `maxwidth:physical`). A primary input and a unit input, `m` or `ft` (`roadheight.js:22-64`). The default unit comes from `countryCoder.roadHeightUnit` (`roadheight.js:64`). Imperial values are written as `5'6"` (feet with `'`, inches with `"`, `roadheight.js:145-156`). Metric as a plain number.
  - Maid: a plain number text input. No unit, so a typed `5'6"` is stored, but nothing shows the unit.

### 3.3 check, defaultCheck, onewayCheck

- **check** (113). A checkbox with three states: unset, yes, no (`check.ts:49-53`). Click cycles unset → yes → no → unset (`check.ts:146`). Values `reversible` and `alternating` are skipped (`:151-153`). With mixed values the next value is `yes` if any has yes, else the first value (`:139-144`). The checkbox is indeterminate when the value is empty (`:113`, `:218`) and checked for any value except `no`, empty or unset (`:197-199`). A value that is not one of the options shows in quotes (`:201-205`). The description of the option shows as the tooltip (`:230-237`). 6 check fields have their own options (for example `covered`, `armrest`, `parcel_pickup`, `crossing:island`, `windings:auto`).
- **defaultCheck** (7). The same, but the cycle is unset → yes only, with no "no" (`check.ts:51-52`). Seven fields, for example `two_sided`, `irrigation`, `bicycle_road`, `barrier`.
- **onewayCheck** (2, both `oneway`). Same states, with options `undefined`, `yes`, `no`, `reversible`, `alternating`. A value `1` or `-1` counts as yes (`check.ts:213-215`). When the way has `junction=roundabout` (or similar), an unset `oneway` is shown as implied yes (`check.ts:59-70`). A "Change Direction" button (`inspector.check.reverser`, `data/core.yaml:755`) shows for a way whose value is yes (`check.ts:74-79`) and reverses the way's nodes with `actionReverse` (`check.ts:158-181`). It shows the direction arrow of the way (`check.ts:82-98`).

Maid today: `CheckField` is a select with an unset option (`–`, from the schema's unset option or a dash), Yes and No (`ui/src/inspector/logic.ts:17-39`, `fields.tsx:144-172`). Differences: (a) defaultCheck offers "No", which iD does not (`check.ts:51`); (b) the unset label is "–" where iD says "Unknown" (`check.ts:50`, `core.yaml:747`); (c) no three-state checkbox, no indeterminate look, no tooltip; (d) no reverse button.

Edge cases: a `oneway=-1` shows as yes; `defaultCheck` with a value `no` (raw, from another editor) shows the value in quotes; a way with `junction=roundabout` and no `oneway` shows the implied-yes text.

### 3.4 combo, typeCombo, networkCombo (single value)

- **combo** (277; 146 with a fixed option list, 131 without). The control is a text input with a list (`fields/combo.js:27-40`, `combobox.js`). Typed text is turned into a tag value in `tagValue` (`combo.js:144-157`): an option's label, matched case-insensitively, gives its key; otherwise the text goes through `restrictTagValueSpelling` (`:159-174`): spaces become `_` unless `snake_case: false` (44 fields), and the text is lower-cased unless `caseSensitive` is set (33 fields). The result is cleaned and written (`change`, `combo.js:562-616`, single-value branch). An empty write is skipped while the value is mixed (`:585-586`).
- **Shown text.** `displayValue` (`combo.js:185-212`) shows the translated option label (`options.<value>`), else the raw value. A raw value (no label) is shown in italics (`isRawValue`, `combo.js:810-814`).
- **customValues: false** (77 fields, plus all manyCombo). The input is read-only (`combo.js:816`, `isReadOnly = !_allowCustomValues`; `_allowCustomValues` at `:33`). The user picks from the list only.
- **autoSuggestions: false** (120 fields set it false; 5 set true) turns off taginfo suggestions (`combo.js:32`). Otherwise the suggestions come from taginfo's `values` endpoint (`setTaginfoValues`, `combo.js:388-510`) for 278 combo-family fields (not manyCombo). **Network: taginfo.** Decision needed (section 4).
- **Option sources.** The schema's `options` (labels from `strings.options` in the translation), then taginfo values (inferred from `combo.js:388-510`: static options come first, then taginfo items that are not in the list). For `language:` the list comes from iD's `languages.json` (`combo.js:281-296`, local data). For country keys, iD uses its country list (`combo.js:400-402`, `:449`, local data).
- **Placeholder** (`combo.js:527-560`): the field's placeholder, or the first labels with "…".
- **Escape** cancels, Tab and Enter accept (see section 2).

- **typeCombo** (48). As combo, plus: the value `yes` shows as empty (`combo.js:205`, `:236`), and an empty entry writes `yes` (`tagValue` returns `yes` for empty text, `combo.js:152-153`). 13 have a fixed list.

- **networkCombo** (2: `network`, `operator`-like). As combo, but the taginfo query starts with the feature's country code (`combo.js:404-412`, country from `countryCoder`; local). **Network: taginfo.**

Maid today: `ComboField` is a text input with a `datalist` of the options (`fields.tsx:112-141`). The label of an option is shown as a hint beside the field label (`logic.ts:45-49`, `fields.tsx:283-301`). Gaps: a typed label is stored as the label (no label → key mapping); no snake-case or lower-casing; no `typeCombo` rule; no readonly for `customValues: false`; no suggestions; the Tab, Enter and Escape rules are the browser's.

Edge cases: "Bus Stop" typed becomes `bus_stop`; a label typed in the wrong case maps to its key; `typeCombo` empty writes `yes`; `customValues: false` cannot take free text; a raw value (not in the list) is shown in italics.

### 3.5 multiCombo, manyCombo (checkboxes per key)

- **multiCombo** (18). The field has a `key` ending in `:` (`combo.js:57-60` adds the colon if missing). Each chip is one tag `key + suffix`. A chip has a checkbox: checked for `yes`, unchecked for `no` (negated look), indeterminate for any other value (`combo.js:919-955`). Clicking the checkbox toggles `yes` and `no` (`invertMultikey`, `combo.js:642-651`). The `×` removes the key (`removeMultikey`, `combo.js:618-622`). A new suffix is written as `yes`, unless the key already has a value other than `no` (`combo.js:580-596`; e.g. `language:de=main` stays). Chips are built from every tag that starts with the key prefix (`combo.js:818-848`). A chip shows the label of the suffix (`options.<suffix>`), else the raw suffix in italics (`combo.js:912-925`).
  - Presence: a field shows when any tag starts with its prefix (`field.js:93-101`).
  - Options: the schema's list (9 fields) or taginfo's `multikeys` for the prefix (`combo.js:407-409`, `:434-460`). **Network for the taginfo part.**
  - Examples in the schema: `payment:`, `diet:`, `drink:`, `recycling:`, `fuel:`, `service:vehicle:`, `service:bicycle:`, `currency:`, `communication:`, `language:` (9 fields with a list; the `language:` list comes from local data).
  - Maid: the field has a key (`payment:`) and no `keys`, so `FallbackField` shows one text input for the key `payment:`, and writing it creates a tag literally named `payment:` (`fields.tsx:282`, `:175-186`). Shown only when that empty key has a value, which is never, so the field appears only through a prerequisite. This is a bug and must be fixed first.
- **manyCombo** (4). No key. Each option is a key of its own: choosing `bus` writes `bus=yes`, removing deletes `bus` (`combo.js:586-594` with `field.key` empty: `key = (field.key || '') + v`). Only the listed options (`customValues` is not used; read-only, `combo.js:39`). No taginfo (`combo.js:32`). Four fields; the `keys` are the option list.
  - Maid: rows of the `keys` that have a value (`FallbackField`, `fields.tsx:189-196`), no checkboxes, no list of options.

Edge cases: `diet:vegan=no` shows the checkbox as unchecked and negated; `language:de=main` is not overwritten by adding `de`; removing the last `payment:*` chip removes the key; a suffix with a space becomes `_` (snake case; the 44 `snake_case: false` fields keep spaces).

### 3.6 semiCombo (50)

A semicolon list in one tag, shown as chips.

- Writes: the chips' values plus the new text, duplicates removed unless `allowDuplicates` (no field sets it), joined with `;`, then cleaned (`combo.js:596-603`). A typed comma becomes `;` (`combo.js:572`).
- Chips: each has an `×` that removes that index (`removeMultikey`, `combo.js:618-640`; index based, so duplicates are safe). Chips can be dragged to reorder only when the value is not mixed (`combo.js:905-906`, drag code `:1049-1165`). A chip whose text starts with `https://` shows an outlink button (`combo.js:~955-975`, opens the URL, click only).
- Options: the schema's list (21 fields) or taginfo (29 fields have no list). Values already chosen are removed from the list (`objectDifference`, `combo.js:376`). The "Add" input hides when no custom values are allowed and nothing is left (`combo.js:694`, `:901`).
- Length: the total must stay within 255 characters; the input hides when it is full (`combo.js:880-905`).
- Enter blurs and writes (`combo.js:739-742`). Text is turned into a value with `tagValue` (spaces become `_`, lower case).
- Placeholder: the field's placeholder or "Add" (`combo.js:527-533`).

Maid today: `FallbackField`, a single text input on the key (`fields.tsx:175-188`). The stored text is the whole list as typed. No chips, no comma, no removal by item, no list, no length cap.

Edge cases: remove one of two equal values; type `a,b`; reach 255 characters; a value with a space.

### 3.7 radio, structureRadio

- **radio** (36, each with a `key`). One radio button per option (`radio.js:59-112`). The label is the translated option (`options.<v>`, title and description, `radio.js:84-86`, `:378-380`); a value not in the list is added as a choice, shown in quotes and italics (`:41-45`, `:63-67`). Choosing one writes `key=<value>` and clears the other options' key (`changeRadio`, `radio.js:313-343`; the `key` is set `undefined` first, then the checked one). Radio buttons cannot be unchecked: clearing needs another path (inferred from HTML radio semantics). With no value, the placeholder shows "None" (`inspector.none`, `radio.js:300-304`). The layout adapts: one line, equal spacing, or two columns, measured after rendering (`updateLayout`, `radio.js:115-122`).
- **structureRadio** (3: `tunnel`/`bridge`, `bridge`/`tunnel`, and `bridge`/`tunnel`/`embankment`/`cutting`/`ford`). Keys are the options; each option is a tag `<option>=<value>` (`radio.js:313-346`, the `keys` branch of `updateRadios`, `:101-111`). Choosing `bridge` sets `layer=1` unless the layer is already above 0; choosing `tunnel` sets `layer=-1` unless the layer is already below 0 and the type is not `building_passage` (`radio.js:333-346`). A type list appears under the chosen structure (`structureExtras`, `radio.js:161-212`); its last value is remembered (`_oldType`, `:23`, `:328`). Defaults for waterways: tunnels `culvert`, bridges `aqueduct` (`radio.js:396-402`). The `layer` field appears for bridge and tunnel (`radio.js:233-238`).

Maid today: `radio` and `structureRadio` use `ComboField` (`fields.tsx:31`, `:237-238`): a text input with a datalist. That allows free text, has no radio buttons, no "None", and no layer. Writes are wrong for structureRadio.

Edge cases: choosing a radio twice keeps it selected (inferred); the `layer` tag is written for bridge and removed for a surface road; a tunnel of type `building_passage` gets no layer.

### 3.8 localized (name and its language variants, 9 fields)

- The base field is a text input on `key` (`localized.js:247-266`, cleaned, empty removes). The row shows a translate button that opens the list of language variants (`localized.js:151-224`, `_buttonTip` "translate").
- Variants are tags `key:<lang>`. A tag counts as a variant when the suffix is a valid BCP 47 code (`LANGUAGE_SUFFIX_REGEX`, `localized.js:16`). `name:left`, `name:source` and the like are not variants (`calcMultilingual`, `:118-150`).
- Adding (`addNew`, `:225-245`): a new row at the top with the user's language code, or empty when that is English. Only one empty row at a time.
- Changing the language code (`changeLang`, `:274-303`): the old `key:<old>` is removed, the new `key:<new>` is written with the value. The code is lower-cased when it is not known (`#7156`).
- Changing a value (`changeValue`, `:304-316`): writes `key:<lang>`; empty removes it.
- Language suggestions (`fetchLanguages`, `:318-347`): from iD's `languages.json` and `territory_languages.json` (local data, `localized.js:29-41`), by label, local name, native name or code; the user's language and the country's languages first (`:319-333`). Local data; to be bundled, with its licence checked.
- Locked when the feature has `name:etymology:wikidata`, or the preset adds a name or brand Wikidata (`localized.js:76-105`).
- Maid: `TextField` on the base key only ("language variants come later", `fields.tsx:73`).

Edge cases: `name:de` with the value empty is removed; renaming `en` to `de` moves the tag; `name:left` is not shown in the list; the user's language is not added when English.

### 3.9 address (3: `post`, `addr`, `memorial:addr`)

- A grid of subfields `key:<id>` (`addr:housenumber`, `addr:street`, `addr:city`, `addr:postcode`, ...). The layout comes from iD's `address_formats` (local data, `address.js:18-44`) by the feature's country (`countryCoder`, `address.js:368-378`, bundled). The default layout is housenumber and street, city and postcode (`address.js:27-33`). A country entry can change order and widths (`updateForCountryCode`, `address.js:199-245`).
- Street or place: a dropdown on `addr:street` or `addr:place` (`addDropdown`, `address.js:284-340`); choosing one clears the other (`change`, `:398-404`).
- Suggestions: lists of nearby street names, place names, cities and postcodes from the features already loaded (`getNear*`, `getEnclosing*`, `address.js:44-200`, `context.history().intersects`, `:49`, `:88`). Local data only, no network.
- Placeholders: the country's placeholder text (`getLocalPlaceholder`, `address.js:430-437`, key `placeholders.<key>!<cc>`).
- Writes: each subfield to its `addr:*` key; empty removes (`change`, `address.js:384-415`).

Maid: `FallbackField` shows one row per `addr:*` key that has a value (`fields.tsx:175-196`). No layout, no suggestions, no street or place choice, no empty rows.

Edge cases: a country whose layout puts the house number after the street; `addr:place` set and then `addr:street` typed (the place is cleared); a postcode with spaces (cleaned only on blur).

### 3.10 access (1)

- Keys: `access`, `foot`, `motor_vehicle`, `bicycle`, `horse` (`access.js:9-70`). One row per key, each with a label (`types.<key>`), always shown when the field is shown (`access.js:32-47`).
- Options for each row: yes, no, designated, permissive, destination, customers, private, permit, unknown (`access.js:85-112`). For `access` the list drops yes and designated; for `bicycle` `dismount` is added (`:98-103`). Each option has a title and a description.
- Writes one key on change or blur (`access.js:73-82`). Empty removes the key unless the value is mixed.
- Placeholder: the value the key would have now, from the implied access. Order (`getPlaceholder`, `access.js:318-349`): the key's own value; `motorroad=yes` gives `no` for foot, bicycle, horse; `vehicle` for bicycle and motor_vehicle; `access`; then the default for the road or barrier type (table `placeholdersByTag`, `access.js:115-280`, for example `highway=footway` gives `motor_vehicle=no`); `access=yes` by default unless there is a barrier; else the field placeholder.

Maid: `FallbackField` shows only the keys that have a value (`fields.tsx:189-196`), no options, no placeholders, and the whole field is hidden without a value (`fields.tsx:281`).

Edge cases: `highway=footway` shows `motor_vehicle` placeholder `no`; `motorroad=yes` shows `no` for foot; `access=private` on a bicycle row shows `private` as placeholder.

### 3.11 directionalCombo (4: `sidewalk:both`, `cycleway`, `parking:both`, `parking:both:orientation`)

- Two combos, one per side (`directional_combo.js:25-66`, each a `combo` on `key:left` and `key:right`).
- Writes (`change`, `directional_combo.js:88-104`): the chosen side is written; the other side gets the same value when that is the only value, else `yes` or `no` when the common tag is a direction (`cycleway=left` gives `left=yes`, `right=no`). When both sides match, the common key (`cycleway=lane`) is written and the side keys are removed. `key:both` and `key=both` are read as the same thing (`:91-94`, `:135-138`).
- Reading (`directionalCombo.tags`, `directional_combo.js:132-161`): the values from all selected features are combined; in a multi-selection the field shows "Multiple Values". Maid has no multi-selection yet, so only the single-feature branch applies.
- Options: each side is a combo (taginfo suggestions apply, see 3.4).

Maid: `FallbackField` on the base key only; the `:left` and `:right` keys are not shown or written.

Edge cases: `cycleway=lane` with `cycleway:left=track` shows left track, right lane; `cycleway:both=no` on both sides; setting left to `no` when the common tag is `left`.

### 3.12 restrictions (1, relation based)

Not a tag field. It appears at a node where more than two ways meet (`preset_fields.js:80-85`, `restrictions.js:39-60`). It draws a small map of the turns, with two sliders: the search distance (20 to 50 m, default 30, `restrictions.js:21-26`, `:111-137`) and the number of via ways (0 to 2, `:139-196`). Clicking a turn cycles no → only → allowed, by creating or removing `type=restriction` relations with `actionRestrictTurn` and `actionUnrestrictTurn` (`restrictions.js:330-385`). No network. A decision for later; it needs the model's relations and the intersection code.

Maid today: none.

### 3.13 wikidata (6) and wikipedia (1)

- **wikidata** (6: `wikidata`, `subject:wikidata`, `species:wikidata`, `model:wikidata`, `manufacturer:wikidata`, `flag:wikidata`). A search box that queries Wikidata with the feature's name as the hint (`wikidata.js:138-178`, `services.wikidata.itemsForSearchQuery`). Choosing an item writes the Q id (`change`, `wikidata.js:180-184`). Then (asynchronously) the `wikipedia` tag is set to the article in the user's language, falling back to the other languages or any sitelink (`:187-283`), and the label and description are shown (`:285-367`). **Network: Wikidata API.** It is not in AGENTS.md's list of OSM infrastructure, but the rule that automation sends no requests applies to it too. Decision needed.
- **wikipedia** (1). A language choice and a title. A pasted `https://<lang>.wikipedia.org/wiki/...` URL is split into language and title (`wikipedia.js:187-196`). Writes `wikipedia=<lang>:<title>` (`:196-220`). Then `services.wikidata.itemsByTitle` finds the Q id and writes `wikidata` (`:225-265`). **Network: Wikipedia and Wikidata APIs.** Decision needed.

Maid: both are plain text on the key (`FallbackField`).

### 3.14 Fields Maid can ignore for now

`restrictions` (3.12) and the info button (section 2) are the only parts that are not about tag values.

## 4. Proposed build order

Each step is about an hour (the size in brackets from the table). Most-used types first. Network fields come last and each is marked "needs a decision" (see section 5). The "Add field" list comes early because without it a user cannot add any field that has no value yet. Status (2026-10-13): most steps have a component in `packages/ui/src/inspector/fields/` (checked by file names only; the steps' own tests were not checked).

1. **Row chrome.** Remove and revert buttons with `present` and `modified` (`css/80_app.css:1483-1490`), clean on write (trim, NFC, 255), the length indicator, the "Unknown" placeholder. Test: type 300 characters, the tag holds 255; undo to the original. (S, shared by all)
2. **Add field list.** The "Add field:" input with the fields that are not shown (`moreFields` and universal), sorted by title with universal last, and search by label and terms. Show a field when it is picked. Apply `default` on show. Test: add "Wheelchair" to a shop, set it, remove it. (M)
3. **combo, single value.** Label → key mapping, snake case and lower case (with the two flags), typeCombo "yes" rule, `customValues: false` as read-only, raw values in italics, Tab, Enter, Escape, inline autocomplete. No taginfo yet. (M, 277 + 48)
4. **check family.** A real three-state checkbox; defaultCheck without "No"; "Unknown" for unset; the `1` and `-1` rule for oneway. (S, 113 + 7 + 2)
5. **number family.** Steppers with `increment` (default 1), `minValue` clamp, direction wrap with compass words, locale parsing and decimal count. (M, 65)
6. **Text family.** url open button, identifier outlink (`urlFormat`, `pattern`), tel with `keys`, email, textarea as a textarea. (S each, 51 + 12 + 7 + 4 + 3 + 1)
7. **Date and colour.** The date picker and "set today"; the colour swatch with the picker. (S, 5 + 3)
8. **Bug fix: multiCombo prefix.** Show and write by prefix; chips with checkboxes, yes and no, the × to remove. Fix the `payment:` key bug first. Then manyCombo (no key, `bus=yes`). (M, 18 + 4)
9. **semiCombo.** Chips, `;` join, comma, remove by index, 255 cap, options minus chosen. (M, 50)
10. **radio.** Radio buttons, "None", the label and description. Then structureRadio's type and layer sub-fields. (M, 36; L for structureRadio, 3)
11. **roadspeed and roadheight.** The unit inputs, the country default, `mph` and `5'6"` writes. (S each, 4 + 4)
12. **directionalCombo.** The two sides, the harmonising write and read. (M, 4)
13. **access.** Five rows, options, implied placeholders. (M, 1)
14. **localized.** Base field plus the list of variants, rename, local language list (licence to check). (L, 9)
15. **address.** Layout from the local format data, street or place choice, suggestions from the loaded features. Split in two: layout and choice first, suggestions second. (L, 3)
16. **onewayCheck reverse.** The reverse button with the operations' reverse action. (M, 2)
17. **Locked fields.** `brand`, `network`, `operator`, `flag`, `name` read-only by their data rules (no network). (S)
18. **restrictions.** Decision first (relations and the intersection view). (L, 1)
19. **networkCombo and taginfo suggestions.** Needs a decision (section 5). (M, 278 combo-family fields)
20. **wikidata, wikipedia, and the info button.** Needs a decision (section 5). (M, 6 + 1; info on all)

## 5. Needs a decision

- **Taginfo suggestions** (19): 278 combo-family fields ask taginfo for values (`combo.js:388-510`), and 204 of them have no list at all, so they would be empty without it. AGENTS.md names taginfo as OSM infrastructure, so automation may not call it. Options: a bundled snapshot of the top values per key, generated once by a person from a bulk extract (like the fixtures), or no suggestions for the fields without a list. Pick one.
- **Info button** (20): loads the OSM wiki (`services.osmWikibase`) or Wikidata on click (`tag_reference.js:20-36`). Maid could leave it out, or link to the wiki page without fetching. Decide.
- **Wikidata and Wikipedia** (20): both fields call the Wikidata API, and `wikipedia` also calls the Wikipedia API. Not in AGENTS.md's list, but the same rule applies in automation. Decide whether the fields are read-only in Maid, or only the Q id is typed.
- **Restrictions** (18): depends on the model's relations and the intersection view. Decide the scope before the step.

## 6. Test ideas across fields

- Each text-like field: write a value with spaces, an empty value, a value of 256 characters, Enter, blur, Escape.
- Each combo: a label typed in lower case, a label with a space, a raw value not in the list, `customValues: false`.
- Each multi-key field (`tel`, `address`, `access`, `directionalCombo`, `multiCombo`): the key that has a value is the one written.
- Each check: three clicks return to unset; defaultCheck never reaches "No".
- Undo after each write: the field returns to the value it had.

## 7. Maid bugs found while reading (fix with step 1 or 8)

1. `multiCombo` with a key ending in `:` writes a tag named `payment:` (`fields.tsx:282`, `:175-186`). Fixed (2026-10-13): a write needs a suffix (`multi-logic.ts:117-122`).
2. `defaultCheck` offers "No" (`logic.ts:17-20`, `:34`; iD `check.ts:51`). Fixed (2026-10-13): an unset defaultCheck is unchecked (`packages/ui/src/inspector/logic.ts:193`).
3. `textarea` cannot take a line break (`fields.tsx:224`, `:79`).
4. `radio` and `structureRadio` accept free text in a combo (`fields.tsx:237-238`).
5. Values longer than 255 characters are not cut (`logic.ts:9-12`; iD `util/util.ts:730-745`, `core/context.ts:402`). Fixed (2026-10-13): the value cleaning cuts to 255 (`multi-logic.ts:41` says so; not traced further).
6. Fields with `default` never get their default: Maid parses `default` (`packages/presets/src/presets.ts`, `buildField`) and nothing applies it (iD `field.js:322-333`). Fixed: `applyPreset` applies field defaults (presets report, 2026-10-13).

## 8. Unsure

- Whether the model cuts values to 255 characters somewhere else (not read).
- The exact taginfo ordering of suggestions (`combo.js:388-510`, not traced to the end).
- iD's `combobox.js` in full (only the key handling and the autocomplete were read).
- Whether iD's `restrictions` needs `prefs` storage in Maid (`restrictions.js:21-23`, not checked).
- The licences of `languages.json`, `territory_languages.json`, `phone_formats.json` and `address_formats.json` in iD's `data/` (not read).
