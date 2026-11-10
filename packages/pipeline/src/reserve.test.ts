import { describe, expect, it } from "vitest";
import { reserveKey } from "./activities";

describe("reserveKey", () => {
  it("keeps the original storyboard key for the first run", () => {
    expect(reserveKey("e1", "storyboard", 0)).toBe("reserve:e1:storyboard");
  });

  it("gives every relaunch its own reservation, so it is charged and refunded on its own", () => {
    const keys = [reserveKey("e1", "storyboard", 0), reserveKey("e1", "storyboard", 1), reserveKey("e1", "production", 2), reserveKey("e1", "production", 3)];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
