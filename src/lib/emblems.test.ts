import { describe, expect, it } from "vitest";
import { removeBackground, visibleBounds, hasTransparentBorder } from "./emblems";

/** 10x10 white image with a red 4x4 square in the middle. */
function badge() {
  const w = 10, h = 10, data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const x = p % w, y = Math.floor(p / w);
    const red = x >= 3 && x <= 6 && y >= 3 && y <= 6;
    data.set(red ? [220, 20, 20, 255] : [255, 255, 255, 255], p * 4);
  }
  return { data, width: w, height: h };
}

describe("emblem background removal", () => {
  it("erases the solid background and keeps the badge", () => {
    const out = removeBackground(badge());
    expect(out.data[3]).toBe(0); // corner pixel transparent
    expect(out.data[(5 * 10 + 5) * 4 + 3]).toBe(255); // badge pixel kept
    expect(visibleBounds(out)).toEqual({ x: 3, y: 3, width: 4, height: 4 });
  });

  it("keeps same-colored areas inside the badge that do not touch the edge", () => {
    const img = badge();
    img.data.set([255, 255, 255, 255], (4 * 10 + 4) * 4); // white hole inside the red square
    // close the hole off: it is surrounded by red so the flood fill cannot reach it
    const out = removeBackground(img);
    expect(out.data[(4 * 10 + 4) * 4 + 3]).toBe(255);
  });

  it("leaves images that already have an empty background untouched", () => {
    const img = badge();
    for (let p = 0; p < 100; p++) if (img.data[p * 4 + 1] === 255) img.data[p * 4 + 3] = 0;
    expect(hasTransparentBorder(img)).toBe(true);
    const out = removeBackground(img);
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });
});
