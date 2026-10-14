/**
 * URL parameters that modules declare (docs/research/url-state-audit.md, section 3.4, option A).
 *
 * A module declares a parameter in `setup`: `api.urlParam({ name, parser, options, iD })`. The editor keeps
 * one list of them. A name that is taken is refused: by the app's own parameters (the editor's
 * `reservedUrlParams`, which the shell passes in) or by another module. A parameter may name its iD form,
 * and the shell builds the iD mapping from this list.
 *
 * This file has no React and no nuqs import. A nuqs parser has the shape of `UrlParser`, so the shell's hook
 * can hand a declared parameter's parser and options to `useQueryState`.
 */

/**
 * Reads a query value and writes it back. `parse` returns `null` for a value that is not valid; the parameter
 * then has no opinion and the stored choice applies. nuqs' parsers (`parseAsString`, `parseAsCamera`, ...) have this shape.
 */
export interface UrlParser<T> {
  // method syntax on purpose: a parser of one type can be listed beside parsers of others
  parse(value: string): T | null
  serialize(value: T): string
  eq?(a: T, b: T): boolean
}

export interface UrlParamOptions {
  /** `replace` (the default, as iD does for every hash change) keeps one history entry; `push` adds one per change. */
  history?: 'replace' | 'push'
  /**
   * Removes the key when the value equals the parser's default. Not set, nuqs decides (it removes). Set `false` for
   * "what is shown" parameters, so that a link says what its author saw.
   */
  clearOnDefault?: boolean
}

/** The name of the same parameter in iD's hash, and how its value converts. Without conversions the value is the same. */
export interface IdUrlName {
  /** iD's name in the hash, e.g. `background` */
  name: string
  /** iD's value to Maid's notation. `undefined` when it cannot be read: the parameter is then left out with a note. */
  fromId?: (value: string) => string | undefined
  /** Maid's value to iD's notation */
  toId?: (value: string) => string
}

export interface UrlParamDeclaration<T> {
  /** The query parameter, e.g. `background`: letters, digits and `_`, starting with a letter */
  name: string
  parser: UrlParser<T>
  options?: UrlParamOptions
  /** iD's name for it, so that iD links map onto this parameter (the shell's id-url.ts) */
  iD?: IdUrlName
}

/** What a module gets back from `api.urlParam`: the declaration with its options resolved. */
export interface UrlParamHandle<T> {
  readonly name: string
  readonly parser: UrlParser<T>
  readonly options: UrlParamOptions
  readonly iD?: IdUrlName
}

export interface UrlParams {
  /** Every declared parameter, in declaration order. A new array after each change. */
  list(): readonly UrlParamHandle<unknown>[]
  get(name: string): UrlParamHandle<unknown> | undefined
  /**
   * Declares a parameter for `owner` (a module id). Throws when the name is not valid or taken, or when its iD name is
   * taken by another declared parameter. `remove` takes it out again (done on module cleanup).
   */
  declare<T>(
    declaration: UrlParamDeclaration<T>,
    owner: string,
  ): { handle: UrlParamHandle<T>; remove: () => void }
}

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * The registry of one editor. `reserved` are the names the app owns: they are refused for modules.
 */
export function createUrlParams(reserved: readonly string[] = []): UrlParams {
  const reservedNames = new Set(reserved)
  const declared = new Map<string, { handle: UrlParamHandle<unknown>; owner: string }>()

  return {
    list() {
      return [...declared.values()].map((entry) => entry.handle)
    },
    get(name) {
      return declared.get(name)?.handle
    },
    declare<T>(declaration: UrlParamDeclaration<T>, owner: string) {
      const { name, parser, iD } = declaration
      if (!NAME.test(name)) {
        throw new Error(
          `URL parameter "${name}" (module "${owner}") is not valid: use letters, digits and "_", starting with a letter.`,
        )
      }
      if (reservedNames.has(name)) {
        throw new Error(
          `URL parameter "${name}" (module "${owner}") is taken by the app's own parameters. Choose another name.`,
        )
      }
      const taken = declared.get(name)
      if (taken) {
        throw new Error(
          `URL parameter "${name}" (module "${owner}") is already declared by module "${taken.owner}".`,
        )
      }
      if (iD) {
        for (const entry of declared.values()) {
          if (entry.handle.iD?.name === iD.name) {
            throw new Error(
              `iD parameter "${iD.name}" (URL parameter "${name}", module "${owner}") is already used by "${entry.handle.name}" (module "${entry.owner}").`,
            )
          }
        }
      }
      const handle: UrlParamHandle<T> = {
        name,
        parser,
        options: { ...declaration.options, history: declaration.options?.history ?? 'replace' },
        iD,
      }
      declared.set(name, { handle: handle as UrlParamHandle<unknown>, owner })
      return {
        handle,
        remove() {
          // Only the declaration that made this entry; a later one with the same name stays.
          if (declared.get(name)?.handle === handle) declared.delete(name)
        },
      }
    },
  }
}

export interface LayeredSetting<T> {
  /** The value to show: the URL's, else the stored choice, else the default */
  value: T
  /** True when the URL decides and its value differs from the person's own choice */
  fromLink: boolean
}

/**
 * Which value a setting shows, from three layers, strongest first: the URL (`null` or `undefined` when the URL
 * says nothing), the person's stored choice, and the default. `fromLink` is true only when the URL gives a value
 * that differs from the stored choice; with no stored choice the default stands in for it. A link never writes
 * storage, so a link that repeats the stored choice shows no difference. `same` compares two values (default `Object.is`).
 */
export function layered<T>({
  url,
  stored,
  fallback,
  same = Object.is,
}: {
  url: T | null | undefined
  stored: T | null | undefined
  fallback: T
  same?: (a: T, b: T) => boolean
}): LayeredSetting<T> {
  const own = stored ?? fallback
  if (url === null || url === undefined) return { value: own, fromLink: false }
  return { value: url, fromLink: !same(url, own) }
}
