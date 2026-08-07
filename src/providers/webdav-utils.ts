export function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function localName(element: Element): string {
  return element.localName || element.tagName.replace(/^.*:/, "");
}

export function childByLocal(parent: Element, name: string): Element | null {
  for (const element of Array.from(parent.children)) {
    if (localName(element) === name) return element;
  }
  return null;
}

export function descendantsByLocal(parent: Element | Document, name: string): Element[] {
  return Array.from(parent.getElementsByTagName("*")).filter(
    (element) => localName(element) === name,
  );
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
