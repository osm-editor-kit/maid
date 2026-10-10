import { useState } from 'react'

type Props = { onAdd: (key: string, value: string) => void }

const INPUT = 'min-w-0 flex-1 rounded border border-neutral-300 px-1 py-0.5 focus:border-blue-500 focus:outline-none'

/** A key and a value field to add one tag */
export function AddTag({ onAdd }: Props) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!key.trim() || !value.trim()) return
    onAdd(key.trim(), value.trim())
    setKey('')
    setValue('')
  }
  return (
    <form onSubmit={submit} className="mt-3 flex gap-1 font-mono text-xs">
      <input aria-label="New tag key" placeholder="key" className={INPUT} value={key} onChange={(e) => setKey(e.target.value)} />
      <input aria-label="New tag value" placeholder="value" className={INPUT} value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="rounded bg-neutral-800 px-2 text-white hover:bg-neutral-700">
        Add
      </button>
    </form>
  )
}
