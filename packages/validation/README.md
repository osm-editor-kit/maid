# @osm-editor-kit/maid-validation

Rules that look at what was changed and say what is wrong with it, with fixes as actions. Headless: it works on the graph of `maid-model`, with no map and no UI.

```ts
const validator = createValidator(defaultRules)
validator.validate(graph, changedIds, allWays)
validator.issues() // [{ rule, severity, message, entityIds, loc?, fixes }]
```

- A **rule** looks at one entity and returns issues. Three so far, ported from Rapid's validators: `missing_tag`, `disconnected_way`, `crossing_ways` (two ways that cross without a shared node: roads with roads, buildings, railways and waterways on the same layer).
- An **issue** has one sentence, the entities it is about, a place if it has one, and **fixes**: actions that become one undo step ("Connect the features", "Delete this feature").
- The validator checks what it is told to, which is what a person changed. Checking everything that was loaded would report other people's old mistakes. That also defines "not connected": a group of changed roads that reaches no road that was left alone.

The editor uses it through a module (`apps/maid/src/modules/validation.tsx`): after every edit, undo and redo it validates the changed entities and shows the issues in the inspector and in the dock.

Compared with Rapid: no localised texts, no check against tiles that are not loaded, and of `crossing_ways` only the cases above (no aeroways, indoor, conveying or connection tags, no "add a bridge or tunnel" fixes).
