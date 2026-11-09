import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EMBLEM_BUCKET } from "@/lib/emblems";
import { Button } from "./ui/button";

export const emblemUrl = (path: string) => supabase.storage.from(EMBLEM_BUCKET).getPublicUrl(path).data.publicUrl;

/** The emblem picture itself (transparent PNG), sized to sit next to a name. */
export function EmblemImage({ path, name, season, className = "h-5 w-5" }: { path: string; name: string; season?: number | null | undefined; className?: string | undefined }) {
  const label = season === null || season === undefined ? name : `${name} — Season ${season}`;
  return <img src={emblemUrl(path)} alt={label} title={label} loading="lazy" draggable={false} className={`inline-block shrink-0 select-none object-contain align-middle ${className}`} />;
}

type EquippedEmblemRow = { user_id: string; name: string; image_path: string; season_number: number | null };
export const EQUIPPED_EMBLEMS_KEY = ["equipped-emblems"] as const;

/** Emblem the player chose to show, rendered in front of their name. One shared cached list for the whole screen. */
export function EquippedEmblem({ userId, className }: { userId?: string | null | undefined; className?: string }) {
  const { data } = useQuery({ queryKey: EQUIPPED_EMBLEMS_KEY, queryFn: async () => {
    const r = await supabase.rpc("get_equipped_emblems"); if (r.error) throw r.error; return r.data as EquippedEmblemRow[];
  }, staleTime: 30000, refetchInterval: 60000 });
  const row = userId ? data?.find((e) => e.user_id === userId) : undefined;
  return row ? <EmblemImage path={row.image_path} name={row.name} season={row.season_number} className={className} /> : null;
}

/** Owner's own emblem list on the Profile page, with the choice of which one to show. */
export function MyEmblems({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["player-emblems", userId], queryFn: async () => {
    const r = await supabase.from("player_emblems").select("equipped,seasons(number),emblems(id,name,image_path)").eq("user_id", userId).order("granted_at");
    if (r.error) throw r.error; return r.data;
  }, staleTime: 30000 });
  if (!data?.length) return null;
  async function equip(id: string | null) {
    if (busy) return; setBusy(true);
    try {
      const r = await supabase.rpc("equip_emblem", id ? { p_emblem: id } : {}); if (r.error) throw r.error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["player-emblems"] }), qc.invalidateQueries({ queryKey: EQUIPPED_EMBLEMS_KEY })]);
    } catch { toast.error("Não consegui trocar o emblema."); } finally { setBusy(false); }
  }
  return <section className="mt-4 w-full border-t border-border pt-4">
    <h3 className="mb-1 text-sm font-semibold">Meus emblemas</h3>
    <p className="mb-3 text-xs text-muted-foreground">O emblema escolhido aparece na frente do seu nome no site todo.</p>
    <div className="flex flex-wrap justify-center gap-2" aria-label="Emblemas do jogador">
      <Button size="sm" variant={!data.some((r) => r.equipped) ? "default" : "outline"} disabled={busy} onClick={() => equip(null)}>Sem emblema</Button>
      {data.map((row) => row.emblems && <Button key={row.emblems.id} size="sm" variant={row.equipped ? "default" : "outline"} aria-pressed={row.equipped} disabled={busy} className="h-auto gap-2 py-1.5" onClick={() => equip(row.emblems?.id ?? null)}>
        <EmblemImage path={row.emblems.image_path} name={row.emblems.name} season={row.seasons?.number} className="h-7 w-7" />
        <span className="text-xs">{row.emblems.name}{row.seasons?.number !== undefined && row.seasons?.number !== null ? ` · S${row.seasons.number}` : ""}</span>
      </Button>)}
    </div>
  </section>;
}

export type SeasonEmblem = { id: string; name: string; image_path: string; season_id: string | null; season_number: number | null; season_name: string | null };

/** Every emblem a player has received, with the season it belongs to (public, used by profile achievements). */
export function usePlayerEmblems(userId: string) {
  return useQuery({ queryKey: ["player-emblems-public", userId], queryFn: async (): Promise<SeasonEmblem[]> => {
    const r = await supabase.from("player_emblems").select("season_id,seasons(number,name),emblems(id,name,image_path)").eq("user_id", userId).order("granted_at");
    if (r.error) throw r.error;
    return r.data.flatMap((row) => row.emblems ? [{ id: row.emblems.id, name: row.emblems.name, image_path: row.emblems.image_path, season_id: row.season_id, season_number: row.seasons?.number ?? null, season_name: row.seasons?.name ?? null }] : []);
  }, staleTime: 30000 });
}
