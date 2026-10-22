import { tagDiffRows, type TagDiffRow } from './tag-diff.ts'

/**
 * The tags before and after a change, one row per key, as iD's tag diff of an outdated-tags issue shows them:
 * `+ key=value` added (emerald), `− key=value` removed (red, struck through), `~ key=` changed (amber, the old value
 * struck through, then the new one). Unchanged keys only with `showUnchanged`. Monospace, like the tag table.
 */
export function TagDiff({
  before,
  after,
  showUnchanged = false,
}: {
  before: Readonly<Record<string, string>>
  after: Readonly<Record<string, string>>
  showUnchanged?: boolean
}) {
  const rows = tagDiffRows(before, after).filter((row) => showUnchanged || row.kind !== 'unchanged')
  return (
    <ul className="max-h-64 overflow-y-auto rounded-lg border border-zinc-950/10 font-mono text-xs/5 dark:border-white/15">
      {rows.map((row) => (
        <li key={row.key} className={`px-2.5 py-1 break-all whitespace-pre-wrap ${TONE[row.kind]}`}>
          <Row row={row} />
        </li>
      ))}
    </ul>
  )
}

const TONE: Record<TagDiffRow['kind'], string> = {
  added: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  removed: 'bg-red-50 text-red-800 line-through dark:bg-red-950/40 dark:text-red-300',
  changed: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  unchanged: 'text-zinc-500 dark:text-zinc-400',
}

function Row({ row }: { row: TagDiffRow }) {
  switch (row.kind) {
    case 'added':
      return <>{`+ ${row.key}=${row.value}`}</>
    case 'removed':
      return <>{`− ${row.key}=${row.value}`}</>
    case 'changed':
      return (
        <>
          {`~ ${row.key}=`}
          <s className="opacity-70">{row.before}</s>
          {' → '}
          {row.after}
        </>
      )
    case 'unchanged':
      return <>{`  ${row.key}=${row.value}`}</>
  }
}
