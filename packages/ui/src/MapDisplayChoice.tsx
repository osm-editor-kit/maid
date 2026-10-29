import { m } from '@osm-editor-kit/maid-i18n'
import type { MaidEngine, MapDisplay } from '@osm-editor-kit/maid-renderer'
import { useSyncExternalStore } from 'react'
import { chooseDisplay } from './display.ts'
import { TAP, toolButtonTone } from './Toolbar.tsx'

/**
 * What the map shows of the data, as a choice: the normal look, the wireframe (W) or the changes in colour (G). The
 * same choice as the keys. It reads the engine, so it shows what a key set too.
 */
export function MapDisplayChoice({ engine }: { engine: MaidEngine }) {
  const display = useSyncExternalStore(engine.subscribe, () => engine.display)
  const choices: { display: MapDisplay; name: string; hint: string; key?: string }[] = [
    { display: 'normal', name: m.map_display_normal(), hint: m.map_display_normal_hint() },
    {
      display: 'wireframe',
      name: m.map_display_wireframe(),
      hint: m.map_display_wireframe_hint(),
      key: 'W',
    },
    { display: 'edits', name: m.map_display_edits(), hint: m.map_display_edits_hint(), key: 'G' },
  ]
  return (
    <section aria-label={m.map_display_label()} className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-zinc-500 uppercase dark:text-zinc-400">
        {m.map_display_label()}
      </h3>
      <div role="radiogroup" aria-label={m.map_display_label()} className="flex flex-col gap-1">
        {choices.map((choice) => {
          const checked = display === choice.display
          return (
            <button
              key={choice.display}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => chooseDisplay(engine, choice.display)}
              className={`rounded-md px-2 py-1.5 text-left ${TAP} ${toolButtonTone(checked ? 'selected' : 'idle')}`}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {choice.name}
                {choice.key && (
                  <kbd className="rounded border border-zinc-300 px-1 font-mono text-[10px] font-normal text-zinc-500 dark:border-zinc-600 dark:text-zinc-400 touch:hidden">
                    {choice.key}
                  </kbd>
                )}
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">{choice.hint}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
