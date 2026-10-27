/** The error a promise rejects with, or undefined when it resolves. Tests use it instead of `expect(...).rejects`. */
export async function errorOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending
    return undefined
  } catch (error) {
    return error
  }
}

/** The message of the error a promise rejects with, or 'resolved' when it does not reject. */
export async function messageOf(pending: Promise<unknown>): Promise<string> {
  const error = await errorOf(pending)
  if (error === undefined) return 'resolved'
  return error instanceof Error ? error.message : 'a value that is not an Error'
}
