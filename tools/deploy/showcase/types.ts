/**
 * The data of the overview page (`bun run pages-build` writes it to the site's root when several apps are deployed)
 * and of the feature index `docs/features.md` (`bun run features-doc`). One source for both: `features.ts`.
 */

/** How far an editor has a feature: `partial` takes a note in the row */
export type Support = 'yes' | 'partial' | 'no'

/** One row of the comparison: a feature, who has it, and where its code and docs are */
export type FeatureRow = {
  title: string
  /** One or two sentences for a mapper: what it does */
  text: string
  /**
   * Which Maid apps have it. `core`: every Maid (the shell, the renderer and the built-in modules). A factory name
   * (`lanes`, `levels`): the apps whose `maid.config.ts` call it; the page reads that from the configs, so the
   * columns follow the apps without a second list.
   */
  maid: 'core' | { factory: string } | { factories: string[] }
  /** How far a Maid that has it has it, when not `yes` */
  maidSupport?: Support
  /** The package folder under `packages/` whose README explains it */
  pkg?: string
  iD: Support
  rapid: Support
  /** A short note shown under the row, for partial cells or a difference worth knowing */
  note?: string
  /** Where the note's claim is documented (an issue or pull request of iD or Rapid), linked after the note */
  noteUrl?: string
}

export type FeatureGroup = { id: string; title: string; intro?: string; rows: FeatureRow[] }

/** `apps/<app>/overview.json`: what the app's tile on the overview page says */
export type Overview = {
  /** One line under the name: what the editor is for */
  tagline: string
  /** Two or three sentences: who it is for and what it does */
  description: string
  /** Three to five things that stand out, short */
  highlights: string[]
  /** The query the tile's button opens the app with: a good map position for its topic (`map=18/52.52/13.41`) */
  open: string
}

/** One deployed app as the page lists it */
export type ListedApp = {
  folder: string
  name: string
  detail: string
  logo: string
  overview: Overview
  /** The path of its screenshot on the site (`shots/<app>.webp`, from `tools/deploy/showcase/shots/`), if there is one */
  shot?: string
  /** The module factories its `maid.config.ts` calls */
  factories: Set<string>
}

/** A project the page thanks */
export type Thanks = { name: string; url: string; text: string }
