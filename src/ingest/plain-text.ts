// What the system can read from a document (C12). Images keep their alt text; a document
// left with almost no letters (a scan, an image-only file) is not searchable.

const MIN_LETTERS = 20;

/** Replaces each markdown image with its alt text, and drops images that have none. */
export function toPlainText(text: string): string {
  return text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => alt.trim());
}

export function hasReadableText(text: string): boolean {
  return (text.match(/\p{L}/gu)?.length ?? 0) >= MIN_LETTERS;
}
