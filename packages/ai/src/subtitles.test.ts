import { describe, expect, it } from "vitest";
import { buildSrt } from "./subtitles";

describe("buildSrt", () => {
  it("emits one cue per spoken shot with cumulative timing", () => {
    const srt = buildSrt([
      { durationSec: 5, line: "Hello" },
      { durationSec: 5, line: null },
      { durationSec: 5, line: "Bye" },
    ]);
    expect(srt).toBe("1\n00:00:00,100 --> 00:00:04,900\nHello\n\n2\n00:00:10,100 --> 00:00:14,900\nBye\n");
  });
});
