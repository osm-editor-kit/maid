import { defineModule } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import type { EditedLevel } from '@osm-editor-kit/maid-levels'
import type { MapContentProps, MaidEngine } from '@osm-editor-kit/maid-renderer'
import { useEffect, type ComponentType } from 'react'
import { LevelExtrusion } from './LevelExtrusion.tsx'
import { LevelMenu } from './LevelMenu.tsx'
import { LevelPicker } from './LevelPicker.tsx'
import { parseAsLevel } from './url.ts'

/**
 * Building levels: a picker on the map lists the floors of the features in view; choosing one edits on that level
 * (the engine dims the other levels and locks them, engine.setLevel), and a 3D view extrudes the rooms by level.
 * The level is the URL's `level`, Maid's own name (iD has none). Research: docs/research/indoor/README.md.
 */
export function levels() {
  return defineModule({
    id: 'levels',
    setup(api) {
      const levelUrl = api.urlParam<EditedLevel>({
        name: 'level',
        parser: parseAsLevel,
        options: { history: 'replace' },
      })
      // the URL and the engine's level in step: the URL sets the level (a link, back and forward), and a level chosen
      // on the map is written to the URL. The engine's changes are listened to directly, not read in render, so the
      // first render (the engine still without a level) does not write over the link's level.
      function LevelUrlSync({ engine }: { engine: MaidEngine }) {
        const [url, setUrl] = useUrlParam(levelUrl)
        useEffect(
          function showTheUrlLevel() {
            engine.setLevel(url)
          },
          [engine, url],
        )
        useEffect(
          function writeTheChosenLevel() {
            let written = engine.level
            const unsubscribe = engine.subscribe(() => {
              if (engine.level === written) return
              written = engine.level
              void setUrl(written)
            })
            return () => {
              unsubscribe()
            }
          },
          [engine, setUrl],
        )
        return null
      }
      api.register('map.content', { id: 'levels-url', component: withEngine(LevelUrlSync) })
      api.register('map.content', { id: 'levels-picker', component: withEngine(LevelPicker) })
      api.register('map.content', { id: 'levels-extrusion', component: withEngine(LevelExtrusion) })
      // a click on a locked feature without a level offers the levels around it
      api.register('map.content', { id: 'levels-menu', component: withEngine(LevelMenu) })
    },
  })
}

/** The parts of the module need the engine; an app that gives the map content none gets no level mode */
function withEngine(Part: ComponentType<{ engine: MaidEngine }>) {
  return function WithEngine({ engine }: MapContentProps) {
    return engine ? <Part engine={engine} /> : null
  }
}
