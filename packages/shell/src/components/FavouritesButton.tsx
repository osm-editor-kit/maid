import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { StarIcon } from '@heroicons/react/20/solid'
import { device, m } from '@osm-editor-kit/maid-i18n'
import {
  favouriteModifierLabel,
  FavouritesPanel,
  Flyout,
  toolButtonClass,
} from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import {
  setFavouriteNumber,
  startAdding,
  toggleFavourite,
  useFavouriteEntries,
} from '../favourites'
import { MAC } from '../platform'
import { useShell } from '../shell-context'
import { favouriteTexts } from './favourite-texts'
import { PresetIcon } from './PresetIcon'

/**
 * The favourites button of the top bar: a star with a small chevron, before the add buttons. It opens the favourites
 * in a flyout (FavouritesPanel): every favourite, of every geometry, with its number, which can be changed or removed.
 * A click on one of its geometries closes the flyout and starts drawing that geometry with the favourite's tags.
 */
export function FavouritesButton() {
  const { editor, engine } = useShell()
  const entries = useFavouriteEntries()
  const [open, setOpen] = useState(false)
  const key = favouriteModifierLabel(MAC)
  const label = m.favourites_button()
  return (
    <Flyout
      label={label}
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      className="w-[30rem]"
      // the list has many buttons: the flyout does not take the focus, a Tab reaches them
      focus={false}
      trigger={
        <button
          type="button"
          aria-label={label}
          title={m.favourites_button_hint({ key, ...device() })}
          className={toolButtonClass(true, open)}
        >
          <StarIcon aria-hidden="true" className="size-5 text-amber-500 dark:text-amber-400" />
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </button>
      }
    >
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-base font-semibold">{label}</h2>
        <p className="text-zinc-500 dark:text-zinc-400">
          {m.favourites_intro({ key, ...device() })}
        </p>
      </div>
      <FavouritesPanel
        entries={entries}
        renderIcon={(preset) => (
          <PresetIcon icon={preset.icon} className="fill-zinc-700 dark:fill-zinc-200" />
        )}
        texts={favouriteTexts()}
        empty={m.favourites_empty()}
        onSetNumber={(entry, number) => setFavouriteNumber(entry.preset, entry.geometry, number)}
        onRemove={(entry) => toggleFavourite(entry.preset, entry.geometry)}
        onStart={(entry, geometry) => {
          setOpen(false)
          startAdding({ editor, engine }, entry.preset, geometry)
        }}
      />
    </Flyout>
  )
}
