import { describe, expect, it } from "vitest";
import { fontFaceCss, fontFormat, nameFontStyle, newFontId } from "./name-fonts";

describe("name fonts", () => {
  it("accepts only ttf, otf, woff and woff2 files", () => {
    expect(fontFormat("Minha Fonte.TTF")?.mime).toBe("font/ttf");
    expect(fontFormat("a.woff2")?.css).toBe("woff2");
    expect(fontFormat("a.otf")?.ext).toBe("otf");
    expect(fontFormat("foto.png")).toBeNull();
    expect(fontFormat("fonte")).toBeNull();
  });

  it("builds ids the database accepts", () => {
    expect(newFontId("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe("font-3f2504e04f8911d39a0c0305e82c3301");
  });

  it("ignores unsafe ids and urls in the generated css", () => {
    const id = newFontId("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    const css = fontFaceCss([
      { id, url: "https://cdn.example/f.woff2", path: `${id}/1.woff2` },
      { id: "font-x\"}body{", url: "https://cdn.example/f.ttf", path: "x.ttf" },
      { id, url: "https://cdn.example/a\");}", path: `${id}/1.ttf` },
    ]);
    expect(css).toContain(`font-family:"nf-${id}"`);
    expect(css.split("@font-face").length - 1).toBe(1);
    expect(nameFontStyle("bad")).toBeUndefined();
    expect(nameFontStyle(id)?.fontFamily).toContain(`nf-${id}`);
  });
});
