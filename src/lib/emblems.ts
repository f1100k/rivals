/** Pure helpers for player emblems: background removal on raw RGBA pixels and transparent-border trimming. */

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

const at = (d: Uint8ClampedArray, i: number) => d[i] ?? 0;
const dist = (d: Uint8ClampedArray, i: number, c: [number, number, number]) =>
  Math.sqrt((at(d, i) - c[0]) ** 2 + (at(d, i + 1) - c[1]) ** 2 + (at(d, i + 2) - c[2]) ** 2);

/** True when the image border is already mostly transparent (PNG with an empty background). */
export function hasTransparentBorder({ data, width, height }: Rgba) {
  let clear = 0, total = 0;
  const check = (x: number, y: number) => { total++; if (at(data, (y * width + x) * 4 + 3) < 16) clear++; };
  for (let x = 0; x < width; x++) { check(x, 0); check(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { check(0, y); check(width - 1, y); }
  return total > 0 && clear / total > 0.6;
}

/** Most common border color (quantized), used as the background to erase. */
export function borderColor({ data, width, height }: Rgba): [number, number, number] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const r = at(data, i), g = at(data, i + 1), b = at(data, i + 2);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += r; c.g += g; c.b += b; counts.set(key, c);
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { add(0, y); add(width - 1, y); }
  let best = { n: 0, r: 0, g: 0, b: 0 };
  for (const c of counts.values()) if (c.n > best.n) best = c;
  return best.n ? [best.r / best.n, best.g / best.n, best.b / best.n] : [255, 255, 255];
}

/**
 * Erases the background connected to the image border (flood fill), so a badge drawn on a solid
 * background becomes a cut-out. Inner areas with the same color stay intact unless they touch the edge.
 * `tolerance` is a color distance (0–255). Edges next to the erased area get a soft partial alpha.
 */
export function removeBackground(img: Rgba, tolerance = 40): Rgba {
  const { width, height } = img;
  const data = new Uint8ClampedArray(img.data);
  if (hasTransparentBorder(img)) return { data, width, height };
  const bg = borderColor(img);
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (p: number) => { if (!seen[p] && dist(data, p * 4, bg) <= tolerance) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (stack.length) {
    const p = stack.pop()!; const x = p % width; const y = (p - x) / width;
    data[p * 4 + 3] = 0;
    if (x > 0) push(p - 1); if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width); if (y < height - 1) push(p + width);
  }
  // Soften the outline: pixels touching the erased area that are still close to the background fade out.
  const soft = tolerance * 1.8;
  for (let p = 0; p < width * height; p++) {
    if (seen[p]) continue;
    const x = p % width; const y = (p - x) / width;
    const touches = (x > 0 && seen[p - 1]) || (x < width - 1 && seen[p + 1]) || (y > 0 && seen[p - width]) || (y < height - 1 && seen[p + width]);
    if (!touches) continue;
    const d = dist(data, p * 4, bg);
    if (d < soft) data[p * 4 + 3] = Math.round(at(data, p * 4 + 3) * Math.max(0, Math.min(1, (d - tolerance) / (soft - tolerance))));
  }
  return { data, width, height };
}

/** Bounding box of visible pixels (alpha ≥ 16), or null when the image is empty. */
export function visibleBounds({ data, width, height }: Rgba) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(data, (y * width + x) * 4 + 3) >= 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export const EMBLEM_BUCKET = "emblems";
export const EMBLEM_OUTPUT_SIZE = 256;
