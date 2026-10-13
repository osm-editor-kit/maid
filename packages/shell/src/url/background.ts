/**
 * The `background` link: `background=custom:<template>` shows a custom tile template for this visit (ADR 0009:
 * the link holds for the visit, is never stored, and the parameter stays in the URL). The notation is iD's
 * (background.js: everything after `custom:` is the template). In a query string a template with `&` is
 * URL-encoded, and URLSearchParams decodes it. Undefined for any other value, or for an empty template.
 */
export function customBackgroundLink(search: string): string | undefined {
  const value = new URLSearchParams(search).get('background')
  if (!value?.startsWith('custom:')) return undefined
  const template = value.slice('custom:'.length)
  return template === '' ? undefined : template
}
