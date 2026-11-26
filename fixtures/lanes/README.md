# Lane cases

Small made-up road networks, one per case of drawing lanes on a map, for testing lane editors and for comparing them.
Each case is a few ways with ordinary OSM lane tags (`lanes`, `lanes:forward`, `turn:lanes`, `width:lanes`,
`bus:lanes`, `cycleway:lanes`, `placement`, `oneway=-1`, `junction=roundabout`, …), and a sentence on what a good
drawing does with it. Traffic keeps right. The data is made up, not OSM data, and free to use (no attribution needed).

Made by `bun run fixtures-lanes` (`tools/fixtures/lanes.ts`): change the cases there, not here.

## Files

- `cases.json`: the catalogue: `id`, `title`, `shows` (what the case is about), `file`, `centre` ([lon, lat]).
- `cases/l01.json` … `cases/l22.json`: one case each, in the fixture format of Lane Studio's geometry tests
  (`test/spec/lanes/fixtures` in <https://github.com/MarcelMarzec/LaneStudio>):

  ```json
  {
    "nodes": { "n3000000045": { "loc": [13.339026, 52.6159576], "tags": {} } },
    "ways": [{ "id": "w3000000044", "nodes": ["n3000000045", "n3000000046"], "tags": { "highway": "primary", "lanes": "4" } }]
  }
  ```

- `../lanes.json.gz`: all cases as one scene (`?scene=lanes` in Maid, served by the mock API), one case per 300 m cell,
  each way's `name` starting with its case id.

## The cases

| Id | Case | Id | Case |
| --- | --- | --- | --- |
| L01 | Straight on | L12 | A dual carriageway crossed by a road |
| L02 | A bend between two ways | L13 | A roundabout |
| L03 | A sharp bend | L14 | A bus lane ends |
| L04 | A right-turn lane added | L15 | A cycle lane between the lanes (German pattern) |
| L05 | A left-turn lane in the middle | L16 | The way line moves within the road (`placement`) |
| L06 | Four lanes become two | L17 | A one-way road drawn against its traffic |
| L07 | An unmarked road meets a marked one | L18 | Staggered junction |
| L08 | T-junction | L19 | A slip road leaves |
| L09 | Crossroads with turn lanes | L20 | Two roads merge |
| L10 | A skewed crossing | L21 | Small streets without lane tags |
| L11 | A road splits into a dual carriageway | L22 | Widths per lane |

## Comparing

- `bun run lanes-sheet` draws every case with Maid's street drawing into `reports/lanes-cases.html` and `.png`.
- `packages/module-lanes/src/overlay/lane-cases.test.ts` checks every case (each way drawn, no outline crossing
  itself) and what each one is about where it can be put in numbers (side streets stop at the main road's kerb, the
  arms of the roundabout stop outside the ring, which lanes narrow to nothing).
- Another editor can load the same case files and draw them the same way; a case that one draws well and the other
  does not is a good thing to talk about.
