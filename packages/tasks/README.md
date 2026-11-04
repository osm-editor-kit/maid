# @osm-editor-kit/maid-tasks

The task list format of Maid: a private, MapRoulette-like list of map tasks. A person or a language model writes a
GeoJSON file; Maid loads it, shows each task with a Markdown description, and offers options with a tag diff. This
package is the format and its checks. It has no UI, no network and no React.

- [FORMAT.md](FORMAT.md): the spec, written so it can be pasted as a prompt. Start here when you write a file.
- [task-file.schema.json](task-file.schema.json): the JSON Schema of the structure (generated; see below).

## Files

| File                    | What it is                                                                    |
| ----------------------- | ----------------------------------------------------------------------------- |
| `src/schema.ts`         | Zod 4 schemas and the types `TaskFile`, `Task`, `TaskOption`, `TaskListInfo`   |
| `src/parse.ts`          | `parseTaskFile` and `parseTaskFileText`: the typed file or the errors with paths |
| `src/diff.ts`           | `diffOption`, `applyOption`, `isApplied`: the tag change of an option          |
| `src/order.ts`          | `orderHash` (8 base36 characters over the task ids) and `taskIndex`           |
| `src/json-schema.ts`    | `taskFileJsonSchema()`, from the Zod schema                                    |
| `src/fixture.ts`        | `generateTasks` (from an OSM fixture) and `syntheticTasks` (for size tests), seeded |
| `src/index.ts`          | Re-exports                                                                    |
| `scripts/check.ts`      | `bun run tasks-check <file>`                                                  |
| `scripts/fixture.ts`    | `bun run tasks-fixture`: writes `fixtures/tasks/small.tasks.geojson`           |
| `scripts/json-schema.ts`| Writes `task-file.schema.json`                                                |
| `fixtures/tasks/small.tasks.geojson` (repo root) | 40 tasks cut from the `small` fixture, committed         |

## Scripts

From the repository root:

- `bun run tasks-check <file.geojson>`: checks a file against the format, prints the errors with their paths, writes
  `reports/tasks-check.json`, and exits 1 on any error or when no file is given. Set `TASKS_CHECK_REPORT` to write the
  report elsewhere.
- `bun run tasks-fixture`: regenerates `fixtures/tasks/small.tasks.geojson` (same bytes on every run). Regenerating it
  is a reviewed change.
- `bun packages/tasks/scripts/json-schema.ts`: rewrites `task-file.schema.json`. There is no root script for it yet.
- `bun test packages/tasks`: the tests, including the fixture, the schema file and the check script.

## Notes

- Unknown properties and top-level members are kept and ignored, so newer files still read.
- The format's rules that a schema cannot state (unique task ids, unique OSM references and option ids, a key both set
  and removed, an option with nothing to set or remove) are checked in `parse.ts`, and are not in the JSON Schema.
- `parseTaskFile` reports at most 100 errors and counts the rest in `omitted`.
