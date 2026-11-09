import coroaFogo from "@/assets/frames/moldura_coroa_fogo.png.asset.json";
import dragaoRoxo from "@/assets/frames/moldura_dragao_roxo.png.asset.json";
import coroaFumaca from "@/assets/frames/moldura_coroa_fumaca.png.asset.json";
import geloCristal from "@/assets/frames/moldura_gelo_cristal.png.asset.json";
import luaVermelha from "@/assets/frames/lua-vermelha-nova.png.asset.json";
import correnteRoxa from "@/assets/frames/moldura_corrente_roxa.png.asset.json";
import leaoDourado from "@/assets/frames/moldura_leao_dourado.png.asset.json";
import guerreiroRoxo from "@/assets/frames/moldura_guerreiro_roxo.png.asset.json";
import natureza from "@/assets/frames/moldura_natureza.png.asset.json";
import demonioRoxo from "@/assets/frames/moldura_demonio_roxo.png.asset.json";
import neonRoxo from "@/assets/frames/moldura_neon_roxo_alinhada.png.asset.json";

export interface AvatarFrameDef {
  id: string;
  label: string;
  /** CDN URL of the transparent frame art shown around the avatar. */
  image: string;
  /** Overlay size relative to the avatar circle so the art's inner hole hugs the photo. */
  fit: number;
  offsetX?: number;
  offsetY?: number;
  publicAccess?: boolean;
}

/** Admin-only avatar frames. Rendered as a transparent PNG overlay (.avatar-frame-img). */
export const AVATAR_FRAMES: AvatarFrameDef[] = [
  { id: "coroa-fogo", label: "Coroa de Fogo", image: coroaFogo.url, fit: 150 },
  { id: "dragao-roxo", label: "Dragão Roxo", image: dragaoRoxo.url, fit: 150 },
  { id: "coroa-fumaca", label: "Coroa de Fumaça", image: coroaFumaca.url, fit: 150 },
  { id: "gelo-cristal", label: "Gelo Cristal", image: geloCristal.url, fit: 150 },
  { id: "lua-vermelha", label: "Lua Vermelha", image: luaVermelha.url, fit: 150 },
  { id: "corrente-roxa", label: "Corrente Roxa", image: correnteRoxa.url, fit: 150 },
  { id: "leao-dourado", label: "Leão Dourado", image: leaoDourado.url, fit: 150 },
  { id: "guerreiro-roxo", label: "Guerreiro", image: guerreiroRoxo.url, fit: 150 },
  { id: "natureza", label: "Natureza", image: natureza.url, fit: 150 },
  { id: "demonio-roxo", label: "Demônio", image: demonioRoxo.url, fit: 150 },
  { id: "neon-roxo", label: "LosT Prime", image: neonRoxo.url, fit: 187, offsetX: 0.5, offsetY: -2.5 },
];

/** UI visibility only; the database independently enforces each user's access. */
export function availableAvatarFrames(isAdmin: boolean, grantedFrames: readonly string[] = [], catalog: readonly AvatarFrameDef[] = AVATAR_FRAMES) {
  return catalog.filter((frame) => isAdmin || frame.publicAccess || grantedFrames.includes(frame.id));
}

export interface FrameFit {
  fit: number;
  offsetX: number;
  offsetY: number;
}

export const FIT_LIMITS = { min: 100, max: 450, offset: 50 } as const;

/** Clamps a manual adjustment to the ranges the database accepts. */
export function clampFit(f: FrameFit): FrameFit {
  const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));
  return {
    fit: c(f.fit, FIT_LIMITS.min, FIT_LIMITS.max),
    offsetX: c(f.offsetX, -FIT_LIMITS.offset, FIT_LIMITS.offset),
    offsetY: c(f.offsetY, -FIT_LIMITS.offset, FIT_LIMITS.offset),
  };
}

/** Saved manual adjustment wins over the catalog default. */
export function resolveFit(def: AvatarFrameDef, saved?: FrameFit | null): FrameFit {
  return saved ? clampFit(saved) : { fit: def.fit, offsetX: def.offsetX ?? 0, offsetY: def.offsetY ?? 0 };
}

/** Inline style for the frame overlay; offsets are % of the avatar size. */
export function frameStyle(f: FrameFit) {
  return {
    width: `${f.fit}%`,
    height: `${f.fit}%`,
    left: `calc(50% + ${f.offsetX}%)`,
    top: `calc(50% + ${f.offsetY}%)`,
  };
}
