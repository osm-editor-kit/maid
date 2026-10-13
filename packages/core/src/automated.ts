/**
 * True in a browser that a test tool or an agent drives (`navigator.webdriver`). Under automation
 * no network feature starts and no stored setting is read or written (AGENTS.md, core rule 1).
 * Safe where there is no navigator (`bun test`, a server): then it is false.
 */
export function isAutomated() {
  return typeof navigator !== 'undefined' && navigator.webdriver === true
}
