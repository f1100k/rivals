import { describe, expect, it } from "vitest";
import { clampPromoSize, nextPromoIndex, placeInRotation, promoFileTooBig, promoWidths } from "./promos";

describe("placeInRotation", () => {
  it("adds a library item at the drop position", () => {
    expect(placeInRotation(["a", "b"], "x", 1)).toEqual(["a", "x", "b"]);
  });
  it("reorders an item already in rotation without duplicating it", () => {
    expect(placeInRotation(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });
});

describe("nextPromoIndex", () => {
  it("wraps back to the first item after the last", () => {
    expect(nextPromoIndex(2, 3)).toBe(0);
  });
});

describe("clampPromoSize", () => {
  it("keeps a size inside the allowed range", () => {
    expect(clampPromoSize(140)).toBe(140);
    expect(clampPromoSize(10)).toBe(60);
    expect(clampPromoSize(900)).toBe(200);
  });
  it("falls back to normal size when the stored value is missing or broken", () => {
    expect(clampPromoSize(null)).toBe(100);
    expect(clampPromoSize(undefined)).toBe(100);
    expect(clampPromoSize(Number.NaN)).toBe(100);
  });
});

describe("promoWidths", () => {
  it("grows both widths with the chosen percentage", () => {
    expect(promoWidths(100)).toEqual({ width: 176, widthLg: 256 });
    expect(promoWidths(150)).toEqual({ width: 264, widthLg: 384 });
    expect(promoWidths(60)).toEqual({ width: 106, widthLg: 154 });
  });
});

describe("promoFileTooBig", () => {
  const MB = 1024 * 1024;
  it("accepts a 600 MB promo video", () => {
    expect(promoFileTooBig("video", 600 * MB)).toBe(false);
  });
  it("rejects a promo video above 2 GB", () => {
    expect(promoFileTooBig("video", 2048 * MB + 1)).toBe(true);
  });
  it("keeps promo photos at 50 MB", () => {
    expect(promoFileTooBig("image", 51 * MB)).toBe(true);
  });
});
