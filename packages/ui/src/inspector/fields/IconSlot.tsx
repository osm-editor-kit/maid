import type { IconRenderer } from './shared.ts'

/**
 * The icon of a combo value, in a square slot of the same size with or without one: an option without an icon
 * keeps its label aligned with the others (iD's tag-value-icon). Hidden from assistive technology: the label is
 * what is read. `className` adds to the slot's box (the input's icon is placed over the input).
 */
export function IconSlot(props: {
  icon: string | undefined
  renderIcon: IconRenderer
  className?: string
}) {
  const { icon, renderIcon, className = '' } = props
  return (
    <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center ${className}`}>
      {icon === undefined ? null : renderIcon(icon)}
    </span>
  )
}
