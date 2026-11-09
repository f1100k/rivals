/** Name colors: staff create color/effect styles, players buy or receive them and show their name with it. */
import type { CSSProperties } from "react";

export const NAME_COLOR_STYLES = ["solid", "gradient", "neon", "metal", "glitch", "outline", "shadow"] as const;
export type NameColorStyle = (typeof NAME_COLOR_STYLES)[number];

/** Plain-language labels and whether the second color is used, for the admin form. */
export const STYLE_INFO: Record<NameColorStyle, { label: string; hint: string; second?: string }> = {
  solid: { label: "Cor lisa", hint: "Uma cor só." },
  gradient: { label: "Degradê", hint: "Passa de uma cor para outra.", second: "Cor final" },
  neon: { label: "Neon", hint: "Brilho em volta das letras." },
  metal: { label: "Metálico", hint: "Reflexo de metal, como ouro e prata." },
  glitch: { label: "Glitch", hint: "Letras tremidas com duas sombras coloridas.", second: "Cor da sombra" },
  outline: { label: "Contorno", hint: "Só a borda das letras." },
  shadow: { label: "Sombra", hint: "Sombra deslocada atrás das letras.", second: "Cor da sombra" },
};

export type NameColorDef = { style: NameColorStyle | string; color1: string; color2?: string | null };

export const COLOR_ID_RE = /^color-[a-f0-9]{32}$/;
export function newColorId(uuid: string = crypto.randomUUID()): string {
  return `color-${uuid.replace(/-/g, "").toLowerCase()}`;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
export const isHex = (v: string | null | undefined): v is string => !!v && HEX_RE.test(v);

const mix = (c: string, other: "white" | "black", pct: number) => `color-mix(in srgb, ${c} ${100 - pct}%, ${other} ${pct}%)`;

/** Text paint for a color style. Returns undefined for anything invalid, so names fall back to the normal look. */
export function nameColorStyle(def: NameColorDef | null | undefined): CSSProperties | undefined {
  if (!def || !isHex(def.color1)) return undefined;
  const c1 = def.color1;
  const c2 = isHex(def.color2) ? def.color2 : null;
  const clip = (image: string): CSSProperties => ({
    backgroundImage: image,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  });
  switch (def.style) {
    case "solid":
      return { color: c1 };
    case "gradient":
      return clip(`linear-gradient(90deg, ${c1}, ${c2 ?? mix(c1, "white", 45)})`);
    case "neon":
      return { color: mix(c1, "white", 45), textShadow: `0 0 2px ${c1}, 0 0 6px ${c1}, 0 0 12px ${c1}` };
    case "metal":
      return clip(`linear-gradient(180deg, ${mix(c1, "white", 60)} 0%, ${c1} 42%, ${mix(c1, "black", 40)} 55%, ${c1} 78%, ${mix(c1, "white", 35)} 100%)`);
    case "glitch":
      return { color: c1, textShadow: `-0.06em 0 #ff1f4f, 0.06em 0 ${c2 ?? "#00e5ff"}` };
    case "outline":
      return { color: "transparent", WebkitTextFillColor: "transparent", WebkitTextStroke: `0.06em ${c1}` };
    case "shadow":
      return { color: c1, textShadow: `0.07em 0.07em 0 ${c2 ?? mix(c1, "black", 60)}` };
    default:
      return undefined;
  }
}

/** Ready-made styles matching the color sheet the staff shared. */
export const NAME_COLOR_PRESETS: { name: string; style: NameColorStyle; color1: string; color2?: string }[] = [
  { name: "Branco", style: "solid", color1: "#ffffff" },
  { name: "Preto", style: "shadow", color1: "#000000", color2: "#6b6b6b" },
  { name: "Roxo", style: "solid", color1: "#8a2be2" },
  { name: "Roxo Neon", style: "neon", color1: "#c77dff" },
  { name: "Rosa", style: "solid", color1: "#ff1493" },
  { name: "Vermelho", style: "solid", color1: "#ff0000" },
  { name: "Laranja", style: "solid", color1: "#ff8c00" },
  { name: "Amarelo", style: "solid", color1: "#ffd700" },
  { name: "Verde", style: "solid", color1: "#00ff00" },
  { name: "Ciano", style: "solid", color1: "#00ffff" },
  { name: "Azul", style: "solid", color1: "#0066ff" },
  { name: "Azul Claro", style: "solid", color1: "#00bfff" },
  { name: "Degradê Roxo-Azul", style: "gradient", color1: "#8a2be2", color2: "#0066ff" },
  { name: "Degradê Rosa-Vermelho", style: "gradient", color1: "#ff1493", color2: "#ff3b30" },
  { name: "Degradê Verde-Amarelo", style: "gradient", color1: "#00ff00", color2: "#ffd700" },
  { name: "Dourado", style: "metal", color1: "#d4a017" },
  { name: "Prata", style: "metal", color1: "#b8b8c0" },
  { name: "Neon Azul", style: "neon", color1: "#1e6bff" },
  { name: "Neon Roxo", style: "neon", color1: "#9d4dff" },
  { name: "Neon Rosa", style: "neon", color1: "#ff2d95" },
  { name: "Neon Vermelho", style: "neon", color1: "#ff2020" },
  { name: "Neon Verde", style: "neon", color1: "#22ff55" },
  { name: "Neon Ciano", style: "neon", color1: "#00e5ff" },
  { name: "Neon Amarelo", style: "neon", color1: "#ffe600" },
  { name: "Glitch", style: "glitch", color1: "#ffffff", color2: "#00e5ff" },
  { name: "Contorno Branco", style: "outline", color1: "#ffffff" },
  { name: "Contorno Roxo", style: "outline", color1: "#9d4dff" },
  { name: "Contorno Ciano", style: "outline", color1: "#00e5ff" },
  { name: "Sombra Roxa", style: "shadow", color1: "#9d4dff", color2: "#3b0a75" },
  { name: "Sombra Azul", style: "shadow", color1: "#1e6bff", color2: "#062a73" },
];
