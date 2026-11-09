/** Name fonts: staff import font files, players buy them in the shop and show their name with it. */
export const FONT_BUCKET = "name-fonts";
export const FONT_MAX_BYTES = 5 * 1024 * 1024;

const FORMATS = {
  ttf: { mime: "font/ttf", css: "truetype" },
  otf: { mime: "font/otf", css: "opentype" },
  woff: { mime: "font/woff", css: "woff" },
  woff2: { mime: "font/woff2", css: "woff2" },
} as const;
export type FontExt = keyof typeof FORMATS;
export const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2";

/** Extension and content type for a font file name, or null when it is not a supported font. */
export function fontFormat(fileName: string): { ext: FontExt; mime: string; css: string } | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (!(ext in FORMATS)) return null;
  const f = FORMATS[ext as FontExt];
  return { ext: ext as FontExt, mime: f.mime, css: f.css };
}

export const FONT_ID_RE = /^font-[a-f0-9]{32}$/;
export function newFontId(uuid: string = crypto.randomUUID()): string {
  return `font-${uuid.replace(/-/g, "").toLowerCase()}`;
}

/** CSS family name used for a font id (ids are validated so they are safe inside CSS). */
export function fontFamily(id: string): string {
  return `nf-${id}`;
}

export function nameFontStyle(id: string | null | undefined): { fontFamily: string } | undefined {
  return id && FONT_ID_RE.test(id) ? { fontFamily: `"${fontFamily(id)}", system-ui, sans-serif` } : undefined;
}

/** @font-face rules for the catalog. Browsers only download a font once something uses it. */
export function fontFaceCss(fonts: { id: string; url: string; path: string }[]): string {
  return fonts
    .filter((f) => FONT_ID_RE.test(f.id) && /^https?:\/\/[^"'()\\\s]+$/.test(f.url))
    .map((f) => {
      const fmt = fontFormat(f.path);
      return `@font-face{font-family:"${fontFamily(f.id)}";src:url("${f.url}")${fmt ? ` format("${fmt.css}")` : ""};font-display:swap;}`;
    })
    .join("\n");
}
