# Icon sprites: origin and licences

The SVG files in this folder are cut from the icon sprites that iD builds (`dist/img/*-sprite.svg`
in the pinned iD checkout, `.reference/id`). Each file keeps only the symbols of the icons that Maid
can show, and the `<defs>` they use; the symbols are byte-identical to iD's. Maid reads them at run
time for preset icons (`packages/shell/src/images.ts`, `PresetIcon.tsx`).

`tools/refs/copy-sprites.ts` refreshes them. It runs after `bun run refs-setup` (or
`bun tools/refs/id/setup.ts`) has built iD at the pinned commit; it copies iD's full files to
`.reference/sprites-full` and then runs `bun run sprites-subset` (`tools/refs/subset-sprites.ts`),
which writes this folder. The list of icons is collected by `tools/refs/icon-names.ts`. Do not edit
the files by hand.

| File | Icon set | Upstream | Licence | Checked |
| --- | --- | --- | --- | --- |
| `iD-sprite.svg` | iD's own editor icons | openstreetmap/iD, `svg/iD-sprite` | ISC (iD's `LICENSE.md`) | The licence is iD's, checked. A separate licence for these icons was not found. |
| `maki-sprite.svg` | Maki | mapbox/maki (`@mapbox/maki` 8.2.0) | CC0 1.0 | `package.json` in `.reference/id/node_modules` |
| `temaki-sprite.svg` | Temaki | ideditor/temaki (`@rapideditor/temaki` 5.13.0) | CC0 1.0 | `package.json` in `.reference/id/node_modules` |
| `fa-sprite.svg` | Font Awesome Free icons | fontawesome.com (copied by iD from `svg/fontawesome`) | CC BY 4.0 | `svg/fontawesome/README.md` in iD, and iD's `README.md` attribution list. The Font Awesome version was not confirmed. |
| `pinhead-sprite.svg` | Pinhead | waysidemapping/pinhead (`@waysidemapping/pinhead` 15.25.0) | CC0 1.0 | `package.json` and `LICENSE` in `.reference/id/node_modules/@waysidemapping/pinhead` |
| `roentgen-sprite.svg` | Röntgen icons, by Sergey Vartanov | enzet/Roentgen (`@enzet/roentgen`) | CC BY 4.0 | `LICENSE` in `.reference/id/node_modules/@enzet/roentgen`, and iD's `README.md` attribution list |

Attribution, when the icons are shown in a published work: name each set and its licence from the
table above. Maki, Temaki and Pinhead need no attribution under CC0 1.0. Font Awesome and Röntgen need
attribution under CC BY 4.0.

Not copied here: iD's community and Mapillary sprites (iD's build also makes them).
