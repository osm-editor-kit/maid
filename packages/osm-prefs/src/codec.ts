/**
 * Task statuses packed into text: two bits per task, four tasks per byte, then base64url. The text starts
 * with `b` (plain bytes) or `z` (the same bytes deflated), whichever is shorter. The count of tasks is not
 * in the text: the caller keeps it (in the list's meta) and passes it to `decodeStatuses`.
 */

/** The statuses a task can have. The index in this list is the two-bit code. */
export const TASK_STATUSES = ['open', 'done', 'ignored', 'skipped'] as const

/** One status of a task. */
export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * Packs the statuses to text. Tries the plain form and the deflated form and keeps the shorter one
 * (the plain one on a tie). Throws for a status that is not in `TASK_STATUSES`.
 */
export async function encodeStatuses(statuses: readonly TaskStatus[]): Promise<string> {
  const raw = pack(statuses)
  const plain = `b${toBase64url(raw)}`
  const deflated = `z${toBase64url(await transform(raw, new CompressionStream('deflate'), Infinity))}`
  return deflated.length < plain.length ? deflated : plain
}

/**
 * Reads `count` statuses from text made by `encodeStatuses`. Throws for an unknown prefix, for characters
 * outside base64url, for a byte count that does not match `count`, for padding bits that are not zero, and
 * for deflated data that is corrupt or longer than `count` needs.
 */
export async function decodeStatuses(text: string, count: number): Promise<TaskStatus[]> {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new RangeError(`The task count must be a whole number, not ${count}`)
  const prefix = text.charAt(0)
  const body = text.slice(1)
  const expectedBytes = Math.ceil(count / 4)
  let raw: Uint8Array<ArrayBuffer>
  if (prefix === 'b') {
    raw = fromBase64url(body)
  } else if (prefix === 'z') {
    const deflated = fromBase64url(body)
    raw = await transform(deflated, new DecompressionStream('deflate'), expectedBytes)
  } else {
    throw new Error(`Unknown status encoding "${prefix}"`)
  }
  if (raw.length !== expectedBytes) {
    throw new Error(`The statuses hold ${raw.length} bytes, ${count} tasks need ${expectedBytes}`)
  }
  const unusedBits = (count % 4) * 2
  if (unusedBits > 0 && (raw[expectedBytes - 1] ?? 0) >> unusedBits !== 0) {
    throw new Error('The padding bits of the statuses are not zero')
  }
  const statuses: TaskStatus[] = []
  for (let index = 0; index < count; index++) {
    const code = ((raw[index >> 2] ?? 0) >> ((index & 3) * 2)) & 3
    statuses.push(TASK_STATUSES[code] ?? 'open')
  }
  return statuses
}

/** Packs the codes into bytes, task `i` in bits `2 * (i % 4)` of byte `floor(i / 4)`. */
function pack(statuses: readonly TaskStatus[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.ceil(statuses.length / 4))
  statuses.forEach((status, index) => {
    const code = TASK_STATUSES.indexOf(status)
    if (code < 0) throw new Error(`Unknown task status "${String(status)}"`)
    const at = index >> 2
    bytes[at] = (bytes[at] ?? 0) | (code << ((index & 3) * 2))
  })
  return bytes
}

/** Encodes bytes as base64url without padding. */
function toBase64url(bytes: Uint8Array): string {
  const parts: string[] = []
  for (const byte of bytes) parts.push(String.fromCharCode(byte))
  return btoa(parts.join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** Decodes base64url without padding. Throws for other characters and for a length that no base64 text has. */
function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1)
    throw new Error('The statuses are not base64url')
  const padding = '='.repeat((4 - (text.length % 4)) % 4)
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/') + padding)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * Runs bytes through a (de)compression stream. Throws when the output would be longer than `limit` bytes,
 * which stops a corrupt or hostile input before it fills memory.
 */
async function transform(
  input: Uint8Array<ArrayBuffer>,
  stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter()
  // a failure is reported by the reader below; this side only must not leave an unhandled rejection
  const writing = writer
    .write(input)
    .then(() => writer.close())
    .catch(() => undefined)
  const reader = stream.readable.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > limit)
        throw new Error(`The statuses expand beyond the ${limit} bytes they should hold`)
      parts.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  await writing
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
