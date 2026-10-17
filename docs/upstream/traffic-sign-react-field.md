# Note: move the React traffic sign field to osm-traffic-sign-tools

For Tobias, later. Nothing to do upstream yet.

The traffic sign field for iD lives in the osm-traffic-sign-tools repository as a d3 component
(`@osm-traffic-signs/id-field`), which needs iD's combobox, tooltip and icons as a host. Maid is React, so it gets its
own field first, built in this repository on the APIs of `@osm-traffic-signs/converter`:

- Package: `packages/traffic-sign-field` (`@osm-editor-kit/osm-traffic-sign-field`). It has no Maid dependency: React,
  the converter and Tailwind classes only; texts come in as props. That keeps the move a copy.
- Maid's module `packages/module-traffic-signs` mounts it as the `trafficSign` field type.
- Its behaviour follows the d3 field (sign images, catalogue search, the tag plan for forward and backward), adjusted to
  Maid's look and keys.

Once the behaviour is settled in Maid:

1. Move the package into the osm-traffic-sign-tools repository next to the d3 field, for example as
   `@osm-traffic-signs/react-field`, and publish it.
2. Share the logic both fields need (search, the tag plan, the catalogue loading) in the converter or a small core
   package, so the d3 field and the React field do not drift apart.
3. Maid then depends on the published package and deletes `packages/traffic-sign-field`.
