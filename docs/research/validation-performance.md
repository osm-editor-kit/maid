# Validation performance: is a worker or WASM needed?

Measured with `bun packages/validation/bench/validation.bench.ts` on the dense fixture (`fixtures/dense.json.gz`:
140,863 entities, 20,896 ways, Neukölln). Raw output: `reports/validation-bench.json`. Add this line to the
root `package.json` scripts to run it as `bun run bench-validation`:

    "bench-validation": "bun packages/validation/bench/validation.bench.ts"

Machine load varied between runs (see Unsure points), so read the medians, not single runs.

## Answer

**Main thread, with idle chunks for validating everything. No worker, no WASM for now.**

- A single edit is 4 ms median and 9 ms worst on the dense scene, inside the 16 ms frame budget. Before this step it was
  48 ms median and 73 ms worst.
- Validating everything that is loaded takes 1.2 s in one piece. That is 8 µs per entity, so it fits idle slices of
  roughly 300–500 entities (about 2.5–4 ms each), not one block. iD uses 100 per idle callback.
- A worker would have to hold a copy of the whole graph. Entities are JS objects with Maps, so nothing is transferable.
  The gain would only be the 1.2 s validate-everything run, and only if chunking janks in use.
- WASM would only speed up the segment-pair kernel of `crossing_ways`: 99 M pair tests in 0.67 s, about 7 ns each. A
  median edit runs about 55 k pair tests, about 0.4 ms. The rest of an edit is graph lookups and object access, which
  WASM does not help with.

What would change this: (a) the tag burst grows past about 50 ms per commit (see below), which needs incremental
validation rather than a worker; (b) validate-everything on a city ten times this size becomes a multi-second
chunked job that the user waits for, which would justify a worker with a copied graph; (c) one commit's pair tests
exceed about 1 ms (around 150 k pairs), which would justify a WASM segment kernel.

## Numbers before and after

Per rule, all 140,863 entities, median of 5 runs, ms. Before: rebuilt every way box on every run; after: persistent way index and per-run memo.

| rule | before | after | issues (before = after) |
| --- | ---: | ---: | ---: |
| missing_tag | 130.5 | 152.6 | 2 |
| disconnected_way | 1,309.9 | 196.5 | 17 |
| crossing_ways | 15,355.6 | 671.7 | 23 |
| almost_junction | 636.3 | 76.1 | 10 |
| impossible_oneway | 81.5 | 69.2 | 28 |
| invalid_format | 76.6 | 71.0 | 25 |
| mutually_exclusive_tags | 103.6 | 90.4 | 0 |
| incompatible_source | 66.2 | 55.4 | 0 |
| private_data | 43.9 | 53.0 | 0 |
| missing_role | 48.0 | 57.4 | 0 |
| osm_api_limits | 41.8 | 59.9 | 0 |
| (no rules: context only) | 36.9 | 111.8 | |
| **all rules** | **11,433** | **1,173** | 105 (digest identical) |

The small rules did not get faster, and some got slower by about 10–20 ms. The no-rule context row is 37 ms before and
112 ms after because the index is built there (boxes for all 20,896 ways are needed for `crossing_ways`). Those
differences are within the noise of this machine; the rules themselves were not changed.

One edit, end to end (`Difference` + the way list when a way changed + `validator.update`), 40 edits on 20 ways, median
of 5 passes. Before: every run rebuilt all boxes, so each edit paid the full cost. After: steady state, the validator
keeps its boxes between edits.

| | before median | before worst | after median | after worst |
| --- | ---: | ---: | ---: | ---: |
| move one node (20) | 44.5 | 48.3 | 0.8 | 3.4 |
| change one tag (20) | 54.7 | 72.6 | 6.3 | 8.7 |
| all 40 edits | 48.4 | 72.6 | 4.3 | 8.7 |
| edits over 16 ms | 39 of 40 | | 0 of 40 | |

Entities one edit makes the validator check: median 3, max 22 (of 140,863). The first edit after loading is
41 ms (one-time: it makes all boxes); see the open items.

Bursts of 50 commits on one warm validator, ms per commit:

| burst | before median (worst) | after median (worst) | after entities checked at the end |
| --- | ---: | ---: | ---: |
| drag one node 50 steps | 161.6 (570) | 1.5 (3.2) | 3 |
| 50 tag edits on 50 ways, one after another | 166.4 (1,897) | 20.1 (29.9) | 335 |

A node drag commits once when it ends (`engine.endDrag`), so in the app a drag is one edit (about 1 ms). The drag burst
checks that a series of commits on one node stays cheap.

## Where the time goes now

- **Validate everything (1.17 s):** `crossing_ways` 672 ms (57%): about 99 M segment-pair tests from neighbour pairs
  whose boxes overlap; `disconnected_way` 197 ms, which floods each island once per run; the rest is 8 rules at
  50–150 ms each (per-entity overhead of calls and small lookups).
- **One edit (4.3 ms):** `crossing_ways` is 85% of the instrumented rule time; about 4 neighbour lookups per edit, each
  returning about 54 ways. For a tag edit, about 5 ms is the app building the way list (`waysOf`, a walk of every entity).
- **Tag burst (20 ms per commit, growing):** every commit re-validates the whole difference from the base, not only the
  new change, so the cost grows with the number of changed entities in the session (335 at the end of this burst). This
  is the largest remaining cost. iD validates only what changed since the previous graph; Maid's rule of "what is not
  changed is not reported" makes a direct port a behaviour change, so it is left for a separate decision.

## What changed (in order, each checked against the issue digests)

1. **Way index for `waysNear`** (`packages/validation/src/way-index.ts`, used by `validator.ts`): a grid of 0.002 degrees
   that keeps every way's box between `update` calls. A run recomputes only the boxes of ways whose nodes or tags changed
   since the last update (the validator compares the graph with the previous one, using the changed ids and their
   parents). Ways covering more than 64 cells sit in a list every search tests. Neighbours come back in the same order as
   the list, so `almost_junction` (which takes the first match) gives the same result. Before → after: crossing_ways for all
   entities 15.4 s → 0.67 s; steady-state move edit 44.5 ms → 0.8 ms.
2. **Warm validator in the bench:** the app keeps one validator, so the bench measures the steady state after the first
   edit. Before → after: first-edit cost is 41 ms once per session (not per edit).
3. **Per-run memo** (`RuleContext.memo`, created per run by the validator and by `runContext`): `disconnected_way`
   floods each island once. A flood is shared only when it finds an island or fails for the whole connected part it
   reached; ways that never start an island (golf paths, aerialways) are left out. Before → after: 1,310 ms → 197 ms.
4. **App:** `apps/maid/src/modules/validation.tsx` calls `validator.reset()` on `merge`, because a merge changes base
   entities without an edit. The index assumes that base data only changes through edits, so this call is needed for
   correctness.

Behaviour: the 105 issues on the full scene, the issues of each of the 40 edits, and each rule's own issue count are the
same before and after (digests in the JSON, `issueDigests` and `perRule[].digest`). `bun test packages/validation`: 191
pass, 0 fail (61 todo, as before). `runContext` stays as the reference scan for `id-test-helpers.ts`, which the adopted
iD tests use.

## Open items (not done in this step)

- **First edit after loading: 41 ms** (one block, makes every box). It should run as idle chunks after the load, about
  2,000 ways (around 4 ms) per slot.
- **Way list for tag edits: 5–9 ms** of `waysOf` in the app, because it walks every entity on each way change. The app
  could keep a map of ways, updated from the difference.
- **Incremental validation of the difference** (see the tag burst): the main remaining cost as sessions grow.
- **Applicability by entity type:** rules are called on all 140k entities. A `types` field would skip the calls that
  cannot apply; the gain is in the 50–150 ms per rule, not the edit budget.
- **Box builder:** about 40–50 ms for 20,896 ways, with a node lookup per node. Reading the base map directly could make it
  faster; not measured.

## Unsure points

- Machine load varied between runs. The "before" run was noisier than the final one, and one tag-burst step took 2 s in an
  earlier run (probably GC or a stall, not analysed). The ratios (rule costs, the drag burst, the box rebuild) are far
  larger than the noise; the small-rule differences are not.
- The "before" edit numbers measure the old code, which rebuilt the boxes on every run. Today's first-edit path (41 ms) is
  the same kind of work, so the honest steady-state gain is the ratio of 48 ms to 4 ms per edit.
- The segment-pair count is an upper bound: it counts pairs before the shared-node skip in `crossingsOf`.
- One fixture only (Neukölln). A dense city centre or a long road network may change the grid's cell count and the cost
  of the large-way list; not measured.
- `bun run type-check` shows three errors in `tools/bench/relations-check.ts`, which this step did not touch.
