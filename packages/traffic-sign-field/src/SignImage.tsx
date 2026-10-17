import type { Country } from './catalogue.ts'
import { useSignImage, type LoadSvg } from './use-sign-image.ts'

/** The sign's picture in a fixed box. A box with a mark stands in while it loads and when the sign has none. */
export function SignImage({
  load,
  country,
  part,
  size = 'size-9',
  mark = '',
}: {
  load: LoadSvg
  country: Country
  /** The `osmValuePart` to show; undefined for an unknown sign (no request) */
  part: string | undefined
  size?: string
  /** What the placeholder shows: "?" for an unknown sign */
  mark?: string
}) {
  const url = useSignImage(load, country, part)
  return (
    <span
      aria-hidden="true"
      className={`${size} grid shrink-0 place-items-center overflow-hidden rounded bg-zinc-950/5 text-sm text-zinc-500 dark:bg-white/10 dark:text-zinc-400`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-contain"
        />
      ) : (
        mark
      )}
    </span>
  )
}
