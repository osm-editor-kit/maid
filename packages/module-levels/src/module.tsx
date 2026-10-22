import { defineModule } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import type { EditedLevel } from '@osm-editor-kit/maid-levels'
import type { MapContentProps, MaidEngine } from '@osm-editor-kit/maid-renderer'
import { useEffect, type ComponentType } from 'react'
import { currentLevelEngine, levelEngineActions } from './engine-store.ts'
import { isConnector } from './level-suggestions.ts'
import { LevelExtrusion } from './LevelExtrusion.tsx'
import { LevelMenu } from './LevelMenu.tsx'
import { LevelPicker } from './LevelPicker.tsx'
import { LevelSection } from './LevelSection.tsx'
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
      api.register('map.content', { id: 'levels-engine', component: withEngine(ShareEngine) })
      api.register('map.content', { id: 'levels-picker', component: withEngine(LevelPicker) })
      api.register('map.content', { id: 'levels-extrusion', component: withEngine(LevelExtrusion) })
      // the level of the selected feature at the top of the inspector, "from → to" on stairs: shown for a feature with a
      // level or a connector, and for every feature while a level is edited
      api.register('inspector.section', {
        id: 'levels',
        title: 'Level',
        placement: 'top',
        when: (entity) =>
          LEVEL_KEYS.some((key) => key in entity.tags) ||
          isConnector(entity.tags) ||
          (currentLevelEngine()?.level ?? null) !== null,
        component: LevelSection,
      })
      // a click on a locked feature without a level offers the levels around it
      api.register('map.content', { id: 'levels-menu', component: withEngine(LevelMenu) })
    },
  })
}

/** The tags that put a feature on a level (levels levelsOf) */
const LEVEL_KEYS = ['level', 'repeat_on', 'min_level', 'max_level']

/** The parts of the module need the engine; an app that gives the map content none gets no level mode */
function withEngine(Part: ComponentType<{ engine: MaidEngine }>) {
  return function WithEngine({ engine }: MapContentProps) {
    return engine ? <Part engine={engine} /> : null
  }
}

/** Puts the engine where the inspector's level section finds it (engine-store.ts), while the map is there */
function ShareEngine({ engine }: { engine: MaidEngine }) {
  useEffect(
    function shareTheEngine() {
      levelEngineActions.set(engine)
      return () => levelEngineActions.set(null)
    },
    [engine],
  )
  return null
}
