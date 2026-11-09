import { useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { FONT_BUCKET, fontFaceCss, nameFontStyle } from "@/lib/name-fonts";
import { nameColorStyle, type NameColorDef } from "@/lib/name-colors";
import { EQUIPPED_COLORS_KEY, useEquippedNameColors } from "./NameColors";
import { Button } from "./ui/button";

export const NAME_FONTS_KEY = ["name-fonts"] as const;
export const EQUIPPED_FONTS_KEY = ["equipped-fonts"] as const;

export type NameFontRow = { id: string; name: string; file_path: string; created_at: string };

export function useNameFontCatalog() {
  return useQuery({
    queryKey: NAME_FONTS_KEY,
    queryFn: async (): Promise<NameFontRow[]> => {
      const r = await supabase.from("name_fonts").select("id,name,file_path,created_at").order("created_at");
      if (r.error) throw r.error;
      return r.data;
    },
    staleTime: 60000,
  });
}

const fontUrl = (path: string) => supabase.storage.from(FONT_BUCKET).getPublicUrl(path).data.publicUrl;

/** Registers every imported font once for the whole site (rendered in the root). */
export function NameFontFaces() {
  const { data } = useNameFontCatalog();
  if (!data?.length) return null;
  const css = fontFaceCss(data.map((f) => ({ id: f.id, path: f.file_path, url: fontUrl(f.file_path) })));
  return <style data-name-fonts dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * Decorative fonts often draw tails and swashes outside the normal letter box,
 * so clipped containers (truncate) cut them. Give the glyphs room inside the box.
 */
const GLYPH_ROOM = {
  display: "inline-block",
  maxWidth: "100%",
  lineHeight: 1.35,
  padding: "0.12em 0.18em 0.2em",
  verticalAlign: "middle",
} as const;

/**
 * `truncate` clips on both axes, which cuts descenders like the tail of "g".
 * Clip only sideways (ellipsis still works) and let tails hang below the line.
 */
function glyphStyle(font: CSSProperties, className?: string): CSSProperties {
  const truncates = !!className?.split(/\s+/).includes("truncate");
  // Gradient/metal colors paint the letters with a background clipped to the text, and that
  // background stops at the box edge, so long tails (the "g" of decorative fonts) turn invisible.
  // Extend the box downwards and pull the layout back with a negative margin so nothing moves.
  const paintsWithBackground = font.backgroundClip === "text" || font.WebkitBackgroundClip === "text";
  const tailRoom: CSSProperties = paintsWithBackground ? { paddingBottom: "0.55em", marginBottom: "-0.35em" } : {};
  return { ...font, ...GLYPH_ROOM, ...tailRoom, ...(truncates ? { overflowX: "clip", overflowY: "visible" } : {}) };
}

/** Text written with a given font (shop cards, previews). */
export function FontSample({ fontId, children, className }: { fontId: string; children: ReactNode; className?: string }) {
  const style = nameFontStyle(fontId);
  return <span className={className} style={style ? glyphStyle(style, className) : undefined}>{children}</span>;
}

function useEquippedFonts() {
  return useQuery({
    queryKey: EQUIPPED_FONTS_KEY,
    queryFn: async () => {
      const r = await supabase.rpc("get_equipped_fonts");
      if (r.error) throw r.error;
      return r.data as { user_id: string; font_id: string }[];
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * A player's name, written with the font and color they chose (or the normal look).
 * `colorPreview` shows another color on top of their font (shop and profile previews).
 */
export function PlayerName({ userId, name, className, colorPreview }: { userId?: string | null | undefined; name: ReactNode; className?: string; colorPreview?: NameColorDef | null }) {
  const { data } = useEquippedFonts();
  const { data: colors } = useEquippedNameColors();
  const fontId = userId ? data?.find((f) => f.user_id === userId)?.font_id : undefined;
  const colorDef = colorPreview !== undefined ? colorPreview : userId ? colors?.find((c) => c.user_id === userId) : undefined;
  const style = combine(nameFontStyle(fontId), nameColorStyle(colorDef));
  return <span className={className} style={style ? glyphStyle(style, className) : undefined}>{name}</span>;
}

function combine(font: CSSProperties | undefined, color: CSSProperties | undefined): CSSProperties | undefined {
  return font || color ? { ...font, ...color } : undefined;
}

/** Owner's name colors on the Profile page, with the choice of which one to use. */
export function MyNameColors({ userId, name }: { userId: string; name: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["player-name-colors", userId],
    queryFn: async () => {
      const r = await supabase.from("player_name_colors").select("color_id,equipped,name_colors(id,name,style,color1,color2)").eq("user_id", userId).order("acquired_at");
      if (r.error) throw r.error;
      return r.data;
    },
    staleTime: 30000,
  });
  async function equip(id: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await supabase.rpc("equip_name_color", id ? { p_color: id } : {});
      if (r.error) throw r.error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["player-name-colors"] }), qc.invalidateQueries({ queryKey: EQUIPPED_COLORS_KEY })]);
    } catch { toast.error("Não consegui trocar a cor."); } finally { setBusy(false); }
  }
  const owned = (data ?? []).filter((r) => r.name_colors);
  if (!owned.length) return null;
  return (
    <section className="mt-4 w-full border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">Cor do nome</h3>
      <p className="mb-3 text-xs text-muted-foreground">A cor escolhida aparece no seu nome para todo mundo, junto com a sua fonte. Mais cores na <Link to="/loja" className="text-primary underline">Loja</Link>.</p>
      <div className="flex flex-wrap justify-center gap-2" aria-label="Cores do jogador">
        <Button size="sm" variant={!owned.some((r) => r.equipped) ? "default" : "outline"} disabled={busy} onClick={() => equip(null)}>Cor padrão</Button>
        {owned.map((row) => (
          <Button key={row.color_id} size="sm" variant={row.equipped ? "secondary" : "outline"} aria-pressed={row.equipped} aria-label={`Usar cor ${row.name_colors?.name}`} disabled={busy} className={`h-auto flex-col gap-0 py-1.5 ${row.equipped ? "ring-2 ring-primary" : ""}`} onClick={() => equip(row.color_id)}>
            <PlayerName userId={userId} name={name} colorPreview={row.name_colors} className="text-base leading-tight" />
            <span className="text-[10px] opacity-70">{row.name_colors?.name}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}

/** Owner's fonts on the Profile page, with the choice of which one to use. */
export function MyNameFonts({ userId, name }: { userId: string; name: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["player-fonts", userId],
    queryFn: async () => {
      const r = await supabase.from("player_fonts").select("font_id,equipped,name_fonts(id,name)").eq("user_id", userId).order("acquired_at");
      if (r.error) throw r.error;
      return r.data;
    },
    staleTime: 30000,
  });
  async function equip(id: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await supabase.rpc("equip_name_font", id ? { p_font: id } : {});
      if (r.error) throw r.error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["player-fonts"] }), qc.invalidateQueries({ queryKey: EQUIPPED_FONTS_KEY })]);
    } catch { toast.error("Não consegui trocar a fonte."); } finally { setBusy(false); }
  }
  const owned = (data ?? []).filter((r) => r.name_fonts);
  if (!owned.length) return null;
  return (
    <section className="mt-4 w-full border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">Fonte do nome</h3>
      <p className="mb-3 text-xs text-muted-foreground">A fonte escolhida aparece no seu nome para todo mundo. Mais fontes na <Link to="/loja" className="text-primary underline">Loja</Link>.</p>
      {(
        <div className="flex flex-wrap justify-center gap-2" aria-label="Fontes do jogador">
          <Button size="sm" variant={!owned.some((r) => r.equipped) ? "default" : "outline"} disabled={busy} onClick={() => equip(null)}>Fonte padrão</Button>
          {owned.map((row) => (
            <Button key={row.font_id} size="sm" variant={row.equipped ? "default" : "outline"} aria-pressed={row.equipped} aria-label={`Usar fonte ${row.name_fonts?.name}`} disabled={busy} className="h-auto flex-col gap-0 py-1.5" onClick={() => equip(row.font_id)}>
              <FontSample fontId={row.font_id} className="text-base leading-tight">{name}</FontSample>
              <span className="text-[10px] opacity-70">{row.name_fonts?.name}</span>
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
