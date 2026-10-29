# Research

Findings that the plan builds on. Collected 2026-10-10 by research subagents reading the local checkouts and the web.

- [id.md](id.md): how iD renders, loads data and can be driven by a benchmark
- [rapid.md](rapid.md): the same for Rapid 3 (`bhousel/Rapid`)
- [maplibre.md](maplibre.md): what MapLibre offers for editable data, and how to measure it
- [osm-editor-kit.md](osm-editor-kit.md): our own packages and how they fit
- [mobile-touch-audit.md](mobile-touch-audit.md): Maid on phones and tablets against the `touch-ipad-review` checklist (2026-10-29)
- [first-paint-audit.md](first-paint-audit.md): what a first visit loads before and after the first view, and what to cut (2026-10-29)

## How to read these notes

File and line references point into the checkouts at the commits named at the top of each file. Nothing here was run: neither reference checkout had `node_modules` installed. Claims are leads until someone verifies them.

- **Verified** means checked a second time for this plan (stated next to the claim).
- **Unverified** means reported once, or taken from memory or secondary sources. Verify before a decision depends on it. The first working step that touches the topic says so.

When you verify or disprove a claim, update the note in the same commit as the work that depended on it.

## Verified since

The reference editors were built and run on 2026-10-10. What was checked against these notes, corrected or newly found is in:

- [tools/refs/id/NOTES.md](../../tools/refs/id/NOTES.md): iD 2.42.2. Throttle behaviour, the exact "settled" definition, which hosts iD tries to reach and how each is switched off, auto-hiding numbers per scene.
- [tools/refs/rapid/NOTES.md](../../tools/refs/rapid/NOTES.md): Rapid 3 at `413c0519f`. The same, plus where its start-up time goes.
- [docs/adr/](../adr/): what was measured for MapLibre (update strategies, the `updateData` consistency problem, symbol placement cost).

Where those files and the notes here disagree, those files win.
