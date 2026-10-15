// Cuts a document into passages of at most `maxTokens`, counted with the embedding model's
// tokenizer. Splits on paragraphs first, then sentences, then words, so passages stay readable.
// A heading travels with the paragraph under it.

import { PASSAGE_MAX_TOKENS } from "../simulator/limits.ts";

export type TokenCounter = (text: string) => number;

export function chunk(text: string, countTokens: TokenCounter, maxTokens = PASSAGE_MAX_TOKENS): string[] {
  const blocks = attachHeadings(
    text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean),
  );
  const pieces = blocks.flatMap((b) => fit(b, countTokens, maxTokens));
  return pack(pieces, countTokens, maxTokens, "\n\n");
}

function attachHeadings(blocks: string[]): string[] {
  const out: string[] = [];
  let pendingHeading: string | null = null;
  for (const block of blocks) {
    const isHeadingOnly = /^#{1,6}\s/.test(block) && !block.includes("\n");
    if (isHeadingOnly) {
      pendingHeading = pendingHeading ? `${pendingHeading}\n${block}` : block;
      continue;
    }
    out.push(pendingHeading ? `${pendingHeading}\n${block}` : block);
    pendingHeading = null;
  }
  if (pendingHeading) out.push(pendingHeading);
  return out;
}

/** Breaks one block into pieces that each fit, trying sentences, then words. */
function fit(block: string, countTokens: TokenCounter, maxTokens: number): string[] {
  if (countTokens(block) <= maxTokens) return [block];
  const sentences = block.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1) {
    return pack(sentences.flatMap((s) => fit(s, countTokens, maxTokens)), countTokens, maxTokens, " ");
  }
  return pack(block.split(/\s+/), countTokens, maxTokens, " ");
}

/** Greedily joins consecutive pieces while the result fits. */
function pack(pieces: string[], countTokens: TokenCounter, maxTokens: number, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const candidate = current ? current + separator + piece : piece;
    if (current && countTokens(candidate) > maxTokens) {
      out.push(current);
      current = piece;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  return out;
}
