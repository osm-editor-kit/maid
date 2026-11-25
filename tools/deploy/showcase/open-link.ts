/**
 * The link of an editor button on the overview page, with the URL parameters the page itself was opened with.
 *
 * A link to the overview can carry a place in Maid's form (`?map=18/52.5/13.4&id=w123`, the query) or in iD's form
 * (`#map=18/52.5/13.4&id=w123`, the hash, as on osm.org's edit links). The page passes both on to every editor
 * button: the query into the editor's query, the hash into its hash, where the editor converts it at start
 * (`packages/shell/src/url/id-url.ts`). So one link to the overview lets a person pick the editor afterwards.
 *
 * The button's own parameters (`overview.open` of the app) stay where the link says nothing about them. When the link
 * names a place (`map` or `id`), the button's place goes as a whole: its feature would not be at the link's map.
 *
 * The page inlines this function with `toString()` (no script from elsewhere), so it uses nothing from outside its
 * body.
 */
export function openLink(folder: string, defaults: string, search: string, hash: string) {
  // iD's names whose Maid name differs (id-url.ts and the imagery module): the button's default goes for either
  const maidName: Record<string, string> = {
    locale: 'lang',
    disable_features: 'filters',
    background: 'bg',
    layer: 'bg',
  }
  const filled = (text: string) =>
    new URLSearchParams([...new URLSearchParams(text)].filter(([, value]) => value !== ''))
  const query = filled(search)
  // osm.org's edit link carries `editor=id`, which means nothing to the editors
  query.delete('editor')
  // a hash without `=` is the page's own anchor (#editors), not iD's parameters
  const fromId = filled(hash.includes('=') ? hash.replace(/^#/, '') : '')
  const out = new URLSearchParams(defaults)
  const names = new Set([
    ...query.keys(),
    ...[...fromId.keys()].map((name) => maidName[name] ?? name),
  ])
  if (names.has('map') || names.has('id')) {
    out.delete('map')
    out.delete('id')
  }
  for (const name of names) out.delete(name)
  for (const [name, value] of query) out.append(name, value)
  // the editors expect the slashes and commas of map=… and id=… unescaped, as iD writes them
  const plain = (params: URLSearchParams) =>
    params.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')
  const rest = plain(fromId)
  const own = plain(out)
  return `${folder}/${own ? `?${own}` : ''}${rest ? `#${rest}` : ''}`
}

/** Whether the page's URL names a place (`map` or `id`, in either form), which the page then says above the buttons */
export function namesPlace(search: string, hash: string) {
  const has = (params: URLSearchParams) => Boolean(params.get('map') || params.get('id'))
  return (
    has(new URLSearchParams(search)) ||
    (hash.includes('=') && has(new URLSearchParams(hash.replace(/^#/, ''))))
  )
}
