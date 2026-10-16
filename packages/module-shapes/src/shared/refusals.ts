/**
 * The sentence for a refusal code. A module writes its table, one text function per code: the texts are read when they
 * are shown, so they follow the page's language. A code missing from the table is a type error.
 * @param   table - One function per refusal code, each giving its sentence
 * @return  The function from a code to its sentence
 */
export function sentenceOf<Reason extends string>(
  table: Record<Reason, () => string>,
): (reason: Reason) => string {
  return (reason) => table[reason]()
}
