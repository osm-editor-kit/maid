/**
 * Automated runs draw no background imagery: its tiles come from other people's servers (an app's default imagery,
 * Bing, Esri), and a run must not load them. Adds iD's `background=none` to the hash of an editor link; Maid, iD and
 * Rapid all read it. A link that names a background already (the imagery cases of compare-shots) keeps its own.
 */
export function noBackground(url: string) {
  if (/[?#&](background|bg)=/.test(url)) return url
  return url.includes('#') ? `${url}&background=none` : `${url}#background=none`
}
