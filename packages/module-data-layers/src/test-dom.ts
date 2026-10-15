/**
 * For the tests only. Bun has no `DOMParser`, and GPX is read through the browser's one. This installs a small
 * stand-in when there is none: well-formed XML without namespaces or entities, with the members togeojson reads
 * (tags, attributes, text, descendants by tag name). It is not a DOM in general. A browser run uses its own.
 */

type Attribute = { name: string; value: string }

class TestText {
  readonly nodeType = 3
  constructor(readonly data: string) {}
  get textContent(): string {
    return this.data
  }
  normalize() {}
}

class TestElement {
  readonly nodeType = 1
  readonly childNodes: (TestElement | TestText)[] = []
  readonly localName: string
  readonly attributes: Attribute[]
  constructor(
    readonly tagName: string,
    attributes: Attribute[],
  ) {
    this.localName = tagName.split(':').pop() ?? tagName
    this.attributes = attributes
  }
  get textContent(): string {
    return this.childNodes.map((node) => node.textContent).join('')
  }
  normalize() {}
  getAttribute(name: string): string | null {
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null
  }
  getElementsByTagName(name: string): TestElement[] {
    return descendants(this).filter((element) => name === '*' || element.tagName === name)
  }
  getElementsByTagNameNS(_namespace: string, _name: string): TestElement[] {
    return []
  }
}

function descendants(element: TestElement): TestElement[] {
  const found: TestElement[] = []
  for (const child of element.childNodes) {
    if (child instanceof TestElement) found.push(child, ...descendants(child))
  }
  return found
}

class TestDocument {
  readonly childNodes: TestElement[] = []
  get documentElement(): TestElement | undefined {
    return this.childNodes[0]
  }
  getElementsByTagName(name: string): TestElement[] {
    return this.childNodes.flatMap((root) =>
      [root, ...descendants(root)].filter((element) => name === '*' || element.tagName === name),
    )
  }
}

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
const ATTRIBUTE = /([^\s=]+)\s*=\s*"([^"]*)"/g

/** Parses the XML the tests give. Elements and text only; no check that the text is well-formed. */
function parseTestXml(xml: string): TestDocument {
  const document = new TestDocument()
  const open: TestElement[] = []
  for (const [, closing, opening, attributeText, selfClosing, text] of xml.matchAll(TOKEN)) {
    const parent = open.at(-1)
    if (closing !== undefined) {
      open.pop()
    } else if (opening !== undefined) {
      const attributes = [...(attributeText ?? '').matchAll(ATTRIBUTE)].map(([, name, value]) => ({
        name: name ?? '',
        value: value ?? '',
      }))
      const element = new TestElement(opening, attributes)
      if (parent) parent.childNodes.push(element)
      else document.childNodes.push(element)
      if (!selfClosing) open.push(element)
    } else if (text !== undefined && parent && text.trim() !== '') {
      parent.childNodes.push(new TestText(text))
    }
  }
  return document
}

class TestDOMParser {
  parseFromString(text: string, _type: string) {
    return parseTestXml(text)
  }
}

/** Installs the stand-in as `DOMParser` when the runtime has none (bun). Idempotent. */
export function installTestDOMParser() {
  if (typeof globalThis.DOMParser === 'undefined') {
    Object.assign(globalThis, { DOMParser: TestDOMParser })
  }
}
