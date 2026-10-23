import { m } from './messages.ts'
import type { Message } from './types.ts'

type MessageFunction = (values?: Readonly<Record<string, string | number>>) => string

/**
 * The text of a message the headless code made (parse, load, merge): the module's Paraglide function of that id.
 * Every id they use is in messages/en.json; the tests of message-text check that.
 */
export function text(message: Message) {
  const make = (m as unknown as Record<string, MessageFunction | undefined>)[message.id]
  return make ? make(message.values) : message.id
}
