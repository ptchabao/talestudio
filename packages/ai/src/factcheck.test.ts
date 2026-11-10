import { describe, expect, it } from "vitest";
import { enforceQuotes, splitSources } from "./anthropic";
import { clipSrt } from "./subtitles";

describe("fact-check safety net", () => {
  const sources = splitSources("Le port de Lomé a traité 30 millions de tonnes en 2025.\n\n---\n\nLa ministre a déclaré : « nous visons 35 millions ».");

  it("keeps a verified claim whose quote is really in the cited source", () => {
    const [c] = enforceQuotes([{ claim: "30 Mt", status: "verified", sourceIndex: 1, quote: "traité 30 millions de tonnes" }], sources);
    expect(c!.status).toBe("verified");
  });

  it("downgrades a 'verified' claim with an invented quote or wrong source", () => {
    const out = enforceQuotes(
      [
        { claim: "a", status: "verified", sourceIndex: 1, quote: "traité 40 millions de tonnes" },
        { claim: "b", status: "verified", sourceIndex: 2, quote: "traité 30 millions de tonnes" },
        { claim: "c", status: "contradicted", sourceIndex: null, quote: null },
      ],
      sources,
    );
    expect(out.map((c) => c.status)).toEqual(["unverified", "unverified", "unverified"]);
  });
});

describe("clipSrt", () => {
  it("re-times transcript segments relative to the clip start", () => {
    const srt = clipSrt([{ start: 58, end: 62, text: "a" }, { start: 62, end: 66, text: "b" }, { start: 90, end: 95, text: "c" }], 60, 70);
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:02,000\na\n\n2\n00:00:02,000 --> 00:00:06,000\nb\n");
  });
});
