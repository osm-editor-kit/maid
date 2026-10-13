import { SPRITE_OF_PREFIX } from '../images'
import { appUrl } from '../url/public-url'

type Props = { icon?: string; className?: string }

/** A preset icon from iD's SVG sprites, e.g. `maki-cafe` */
export function PresetIcon({ icon, className }: Props) {
  const sprite = icon ? SPRITE_OF_PREFIX[icon.slice(0, icon.indexOf('-'))] : undefined
  if (!icon || !sprite) return <span className={className} aria-hidden />
  return (
    <svg className={className} aria-hidden>
      <use href={appUrl(`sprites/${sprite}-sprite.svg#${icon}`)} />
    </svg>
  )
}
