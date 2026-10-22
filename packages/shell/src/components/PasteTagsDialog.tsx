import { m } from '@osm-editor-kit/maid-i18n'
import { Dialog, notify, SegmentedControl, TagDiff } from '@osm-editor-kit/maid-ui'
import { tagsOfFeature } from '../commands'
import { useEngine, useShell } from '../shell-context'
import {
  pastedTags,
  type PasteMode,
  tagClipboardActions,
  useCopiedTags,
  usePasteDialog,
} from '../tag-clipboard-store'

const BUTTON_PRIMARY =
  'cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-blue-500 disabled:cursor-default disabled:opacity-50'
const BUTTON_SECONDARY =
  'cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-950/5 dark:text-zinc-200 dark:enabled:hover:bg-white/10'

/**
 * "Paste tags": the copied tags on the selected features, opened by "Paste tags" in the edit menu. Merge or Replace; the
 * diff shows the first feature, as iD's upgrade diff does. Paste writes all features in one undo step.
 */
export function PasteTagsDialog() {
  const { engine } = useShell()
  const paste = usePasteDialog()
  const copied = useCopiedTags() ?? {}
  const first = paste?.ids[0]
  // the tags of the first feature as the engine has them now (the dialog is open for these features)
  const before = useEngine((e) => (first ? tagsOfFeature(e, first) : {}))
  const mode: PasteMode = paste?.mode ?? 'merge'
  const after = pastedTags(before, copied, mode)
  const more = (paste?.ids.length ?? 1) - 1
  const close = () => tagClipboardActions.closePaste()

  const apply = () => {
    if (!paste) return
    const result = engine.setTagsEach(
      paste.ids.map((id) => ({
        id,
        tags: pastedTags(tagsOfFeature(engine, id), copied, paste.mode),
      })),
      'Pasted tags',
    )
    if (!result.ok) notify.failed(m.paste_tags_refused())
    close()
  }

  return (
    <Dialog
      open={paste !== null}
      onClose={close}
      title={m.paste_tags_title()}
      footer={
        <>
          <button type="button" onClick={close} className={BUTTON_SECONDARY}>
            {m.paste_tags_cancel()}
          </button>
          <button type="button" onClick={apply} className={BUTTON_PRIMARY}>
            {m.paste_tags_submit()}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <SegmentedControl<PasteMode>
          label={m.paste_tags_mode_label()}
          options={[
            { value: 'merge', label: m.paste_tags_merge() },
            { value: 'replace', label: m.paste_tags_replace() },
          ]}
          value={mode}
          onSelect={tagClipboardActions.setPasteMode}
          className="w-fit"
        />
        <p className="text-zinc-600 dark:text-zinc-300">
          {mode === 'merge' ? m.paste_tags_merge_hint() : m.paste_tags_replace_hint()}
        </p>
      </div>
      <TagDiff before={before} after={after} />
      {more > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {more === 1 ? m.paste_tags_more_one() : m.paste_tags_more_many({ count: more })}
        </p>
      )}
    </Dialog>
  )
}
