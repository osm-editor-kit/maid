import { m } from '@osm-editor-kit/maid-i18n'
import { Dialog, SegmentedControl, TagDiff } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'

const BUTTON_PRIMARY =
  'cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-blue-500 disabled:cursor-default disabled:opacity-50'
const BUTTON_SECONDARY =
  'cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-950/5 dark:text-zinc-200 dark:enabled:hover:bg-white/10'

/**
 * The dialog of an operation that asks before it runs (`Operation.confirm`, for example Merge of areas with different
 * tags): a value to pick for each key with several, and the tags of the feature that stays as a tag diff, the one of
 * Paste tags. OK runs the operation as one undo step with the picks; Cancel and Escape change nothing.
 */
export function OperationConfirmDialog() {
  const pending = useEngine((engine) => engine.pendingOperation)
  // a new dialog for each operation that waits: the picks start from its defaults
  return pending ? <ConfirmBody key={`${pending.operation.id}`} /> : null
}

function ConfirmBody() {
  const { engine } = useShell()
  const { select } = useSelection()
  const pending = useEngine((e) => e.pendingOperation)
  const [picks, setPicks] = useState<Record<string, string>>({})
  // asked again with the picks, so the diff follows them; the data of this moment
  const confirm = useEngine((e) =>
    pending
      ? pending.operation.confirm?.(e.operationContext(pending.at, pending.choice, picks))
      : undefined,
  )
  const close = () => engine.cancelOperation()
  const apply = () => {
    const next = engine.confirmOperation(picks)
    if (next) select(next.length > 0 ? next : null)
  }
  if (!confirm) return null
  return (
    <Dialog
      open
      onClose={close}
      title={confirm.title}
      footer={
        <>
          <button type="button" onClick={close} className={BUTTON_SECONDARY}>
            {m.operation_confirm_cancel()}
          </button>
          <button type="button" onClick={apply} className={BUTTON_PRIMARY}>
            {confirm.submit}
          </button>
        </>
      }
    >
      {confirm.text && <p className="text-zinc-600 dark:text-zinc-300">{confirm.text}</p>}
      {confirm.picks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{m.operation_confirm_pick()}</p>
          {confirm.picks.map(({ key, options }) => (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="min-w-28 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                {key}
              </span>
              <SegmentedControl<string>
                label={key}
                options={options.map((value) => ({ value, label: value }))}
                value={picks[key] ?? options[0] ?? ''}
                onSelect={(value) => setPicks((before) => ({ ...before, [key]: value }))}
                textSize="xs"
                className="w-fit"
              />
            </div>
          ))}
        </div>
      )}
      <TagDiff before={confirm.before} after={confirm.after} showUnchanged />
    </Dialog>
  )
}
