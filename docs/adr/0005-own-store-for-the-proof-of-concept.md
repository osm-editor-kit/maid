# 0005: The proof of concept uses its own small data store

Date: 2026-10-10

## Decision

`packages/renderer/src/store.ts` is a minimal store (maps for nodes, ways and relations, node use counts, node-to-way lookup). `@osm-editor-kit/osm-data` was **not** evaluated, although step 2.1 of the plan asked for it first.

## Why

The iteration is about rendering. A store that does exactly what the renderer needs took less time than an evaluation, and it keeps the measurements free of a dependency we do not know yet. Its cost is small in the numbers: on the dense scene, merging 12 tiles took 18 ms and building features 129 ms, against 1.8 s for the whole load.

## Consequence

The evaluation is still open and belongs at the start of iteration 2, before any editing logic is written on top of the store: an editor needs a graph with history, which this store is not.
