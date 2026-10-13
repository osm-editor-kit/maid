/**
 * Which paste path runs. A paste reaches the grid as a `paste` event when the browser sends one to the focused input.
 * A read-only input may get none, so the Cmd/Ctrl+V key arms a fallback that reads the clipboard itself. One gesture
 * pastes once: the fallback runs only when no paste event has taken its token first.
 */

/**
 * `pending` is the token a key press armed (null when none is armed or a paste event took it). The fallback armed
 * with `token` runs only if that token is still pending; running it takes the token.
 */
export function takeFallback(
  pending: number | null,
  token: number,
): { take: boolean; pending: number | null } {
  if (pending !== token) return { take: false, pending }
  return { take: true, pending: null }
}
