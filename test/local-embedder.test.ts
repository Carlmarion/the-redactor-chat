// Runs the real model (downloaded once into ./.models). Slower than the other tests.
import { beforeAll, describe, expect, it } from "vitest";
import { LocalEmbedder } from "../src/simulator/local-embedder.ts";

const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

describe("LocalEmbedder", () => {
  let embedder: LocalEmbedder;
  const embedOne = async (text: string, kind: "query" | "passage") => {
    const [v] = await embedder.embed([text], kind);
    if (!v) throw new Error("no vector returned");
    return v;
  };

  beforeAll(async () => {
    embedder = await LocalEmbedder.load();
  }, 120_000);

  it("returns normalised 384-dimension vectors", async () => {
    const v = await embedOne("Full-time staff get 25 days of paid leave.", "passage");
    expect(v).toHaveLength(384);
    expect(dot(v, v)).toBeCloseTo(1, 3);
  });

  it("ranks the relevant passage first, across languages", async () => {
    const q = await embedOne("What time does the office close?", "query");
    const office = await embedOne("Het kantoor is open van maandag tot en met vrijdag van 07:30 tot 19:00.", "passage");
    const leave = await embedOne("Full-time staff get 25 days of paid leave.", "passage");
    expect(dot(q, office)).toBeGreaterThan(dot(q, leave));
  });

  it("counts tokens with the model's tokenizer, prefix and special tokens included", () => {
    const bare = embedder.countTokens("", "passage");
    expect(bare).toBeGreaterThan(2); // "passage: " plus start and end tokens
    expect(embedder.countTokens("Full-time staff get 25 days of paid leave.", "passage")).toBeGreaterThan(bare + 8);
  });
});
