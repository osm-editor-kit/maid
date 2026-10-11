# Styles and lenses

Status: proposal, following Tobias's notes of 2026-10-11.

## What we have

Maid draws OSM data with MapLibre. The look comes from iD's stylesheets, resolved per feature in JavaScript: tags become classes, classes become colours, widths and dashes, and those are written onto the feature as a few short properties (`sc`, `sw`, `cc`, …). The MapLibre layers only read them ([ADR 0001](../adr/0001-style-from-id-css.md)).

So today the features on the map carry **rendering properties, not tags**. That is what keeps the payload to MapLibre small and the layer expressions trivial.

## A lens is a second style

iD's Radnetz fork builds lenses out of CSS classes and a build step. In Maid there are two honest ways to restyle, and they suit different people.

### 1. A different prepare step (for forks)

The step that turns tags into rendering properties is a function. A lens is another such function: "colour cycleways by surface quality", "highlight ways without `maxspeed`".

```ts
lenses: [
  { id: 'surface', name: 'Surface quality', key: 'Q', prepare: surfaceQualityStyle },
]
```

- Switching a lens re-runs the prepare step for the features in view and updates their properties. With the live tier that is fast; it is not free.
- The layers stay the same, so everything that depends on them (hit-testing, highlight, edit) keeps working.
- This is the powerful way and it is code, so it belongs to a fork's configuration.

A prepare function may also add its own properties and bring a few layers that read them. That is the route for a lens that needs something the default layers cannot draw.

### 2. A MapLibre style on top (for users)

Because the renderer is MapLibre, a user-made style can be applied as extra layers over the default ones. For that to be useful the style needs something to style by.

- The default features carry rendering properties only. A user style could recolour by those, which is rarely what someone wants.
- So each build declares a short list of **style keys**: tags that are copied onto the features as they are (`highway`, `surface`, `maxspeed`, …). A fork decides the list. More keys cost payload and memory, so the default list is short.
- User styles may only use the style keys. That is the line between "complex styles in a fork" and "custom styles by a user on top of what the build provides".

### The workflow with an external style editor

Tobias's idea, and it is a clean one because it needs almost no UI in Maid:

1. **Export** from Maid: the features of the current view as GeoJSON, with the style keys as properties, plus a starter style that reproduces the default look.
2. Open both in **Maputnik**, the open-source MapLibre style editor, and design.
3. **Import** the style JSON into Maid as a user lens. Maid checks it: only known sources, only style keys, only layer types we allow.

Maid does not need its own style editor for this. What it needs is the export, the import with validation, and a stable, documented schema of sources and properties, because a user style breaks when a property is renamed.

## What goes on the map: a decision

| | Rendering properties only (today) | All tags on every feature |
| --- | --- | --- |
| Payload to MapLibre | Small | Several times larger |
| Layer expressions | Trivial | Complex, evaluated per feature in the worker |
| Restyle by a tag | Needs the prepare step | A style change |
| User styles | Need declared style keys | Anything |

Proposal: stay with rendering properties, add the declared style keys. It keeps the measured speed and still gives users something real to style by.

## Open

- The default list of style keys.
- Whether a lens can change hit-testing (for example make dimmed features unclickable). Proposal: no; that is a filter's job.
- How a user lens is stored and shared (as a setting, see [storage and settings](09-storage-and-settings.md); a lens in a URL would have to be a name, never the style itself).
- The property schema needs names people can read before it becomes public. `sc` and `cw` are fine internally and bad as an API.
