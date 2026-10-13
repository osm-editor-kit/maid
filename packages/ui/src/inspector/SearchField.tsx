import { MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import type { ComponentProps } from 'react'
import { twMerge } from 'tailwind-merge'
import { SEARCH_FIELD } from './listbox.ts'

/**
 * The search field of a listbox (the feature type picker and "Add field") with a magnifier inside
 * it, at the left. The magnifier is decoration: hidden from screen readers, not focusable, and it
 * does not take the pointer. The input's text starts after it. The input spans the whole field, so
 * its focus ring goes around the whole field.
 */
export function SearchField(props: ComponentProps<'input'>) {
  return (
    <div className="relative flex min-w-0">
      <MagnifyingGlassIcon
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
      />
      <input {...props} className={twMerge(SEARCH_FIELD, 'pl-9', props.className)} />
    </div>
  )
}
