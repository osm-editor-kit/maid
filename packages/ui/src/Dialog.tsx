import { type ReactNode, useEffect, useId, useRef } from 'react'

/**
 * A small modal on the native `<dialog>`: `showModal()` while `open`, `close()` otherwise. Escape and a click on the
 * backdrop call `onClose`; the caller closes it by setting `open` to false. The panel is the flyouts' (white or zinc-800,
 * rounded, shadowed); the footer holds the buttons.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: the caller decides, so the dialog stays open until `open` is false
        event.preventDefault()
        onClose()
      }}
      // the editor's keys (useShortcuts, on the document) stay off while the dialog is open: Cmd+Z or Delete would
      // change the features the dialog is about. Escape still reaches `onCancel`, the browser's default action
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        // a click on the backdrop is a click on the dialog itself: the panel fills it
        if (event.target === event.currentTarget) onClose()
      }}
      className="m-auto w-full max-w-lg rounded-xl border border-zinc-950/10 bg-white p-0 text-sm text-zinc-950 shadow-xl backdrop:bg-zinc-950/25 dark:border-white/15 dark:bg-zinc-800 dark:text-white dark:shadow-2xl dark:shadow-black/60 dark:backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <div className="flex flex-col gap-3">{children}</div>
        {footer && <div className="flex justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  )
}
