// Mapping layer for our generated sample data (data/sample). The client's real export plugs in
// as another implementation of the same ports; nothing past this file knows the file layout.

import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { CorpusEntry, CorpusSource, DocumentSource, PermissionSource, SourceDocument } from "../ports.ts";
import type { DocId, PermissionSnapshot } from "../types.ts";

/** Formats we read as text. Anything else (PDF scans, images) has no readable text (C12). */
const TEXT_FORMATS = new Set([".md", ".txt"]);

interface DocumentsFile {
  exported_at: string;
  documents: (CorpusEntry & { folder: string })[];
}

export class SampleData implements CorpusSource, DocumentSource, PermissionSource {
  constructor(private readonly dir: string) {}

  async list(): Promise<{ exported_at: string; documents: CorpusEntry[] }> {
    const file = await this.json<DocumentsFile>("documents.json");
    return {
      exported_at: file.exported_at,
      documents: file.documents.map(({ doc_id, path, title, allowed, url }) => ({ doc_id, path, title, allowed, url })),
    };
  }

  async read(docId: DocId): Promise<SourceDocument | null> {
    const corpus = join(this.dir, "corpus");
    const name = (await readdir(corpus)).find((f) => f.startsWith(`${docId}.`));
    if (!name) return null;
    if (!TEXT_FORMATS.has(extname(name))) return { text: "", title: null };
    return { text: await readFile(join(corpus, name), "utf8"), title: null };
  }

  load(): Promise<PermissionSnapshot> {
    return this.json<PermissionSnapshot>("permissions.json");
  }

  private async json<T>(name: string): Promise<T> {
    return JSON.parse(await readFile(join(this.dir, name), "utf8")) as T;
  }
}
