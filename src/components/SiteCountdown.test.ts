import { describe, expect, it } from "vitest";
import { splitRemaining } from "./SiteCountdown";

describe("splitRemaining", () => {
  it("splits milliseconds into days, hours, minutes and seconds", () => {
    expect(splitRemaining(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });
  it("never goes negative after the end", () => {
    expect(splitRemaining(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
