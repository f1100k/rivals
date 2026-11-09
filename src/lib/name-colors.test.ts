import { describe, expect, it } from "vitest";
import { NAME_COLOR_PRESETS, NAME_COLOR_STYLES, COLOR_ID_RE, nameColorStyle, newColorId } from "./name-colors";

describe("name colors", () => {
  it("builds ids the database accepts", () => {
    const id = newColorId("3F2504E0-4F89-11D3-9A0C-0305E82C3301");
    expect(id).toBe("color-3f2504e04f8911d39a0c0305e82c3301");
    expect(COLOR_ID_RE.test(id)).toBe(true);
  });

  it("ignores invalid colors and styles so names keep the normal look", () => {
    expect(nameColorStyle({ style: "solid", color1: "red" })).toBeUndefined();
    expect(nameColorStyle({ style: "solid", color1: "#ff0000;}body{" })).toBeUndefined();
    expect(nameColorStyle({ style: "rainbow", color1: "#ff0000" })).toBeUndefined();
    expect(nameColorStyle(null)).toBeUndefined();
  });

  it("paints each style", () => {
    expect(nameColorStyle({ style: "solid", color1: "#8a2be2" })?.color).toBe("#8a2be2");
    expect(nameColorStyle({ style: "gradient", color1: "#8a2be2", color2: "#0066ff" })?.backgroundImage).toBe("linear-gradient(90deg, #8a2be2, #0066ff)");
    expect(nameColorStyle({ style: "neon", color1: "#00e5ff" })?.textShadow).toContain("#00e5ff");
    expect(nameColorStyle({ style: "outline", color1: "#ffffff" })?.WebkitTextStroke).toContain("#ffffff");
  });

  it("ships every preset with a valid style", () => {
    expect(NAME_COLOR_PRESETS).toHaveLength(30);
    for (const p of NAME_COLOR_PRESETS) {
      expect(NAME_COLOR_STYLES).toContain(p.style);
      expect(nameColorStyle(p)).toBeDefined();
    }
  });
});
