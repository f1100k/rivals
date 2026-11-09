import { useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { toast } from "sonner";

export type TagEffect = "none" | "glow-green";
export function RewardTag({ name, textColor, backgroundColor, effect = "none", season }: { name: string; textColor: string; backgroundColor: string; effect?: string | null | undefined; season?: number | null | undefined }) {
  const label = season === null || season === undefined ? name : `${name} · S${season}`;
  return <span title={season === null || season === undefined ? name : `${name} — Season ${season}`} data-effect={effect ?? "none"} className="profile-reward-tag inline-block max-w-full truncate rounded-full border border-current px-1.5 py-px text-[9px] font-bold uppercase align-middle" style={{ "--reward-text": textColor, "--reward-background": backgroundColor } as CSSProperties}>{label}</span>;
}
type EquippedTag = { user_id: string; name: string; text_color: string; background_color: string; effect?: string; season_number?: number | null };
export function EquippedProfileTag({ userId }: { userId?: string | null | undefined }) {
  const { data } = useQuery({ queryKey: ["equipped-profile-tags"], queryFn: async () => {
    const r = await supabase.rpc("get_equipped_profile_tags"); if (r.error) throw r.error; return r.data as EquippedTag[];
  }, staleTime: 30000, refetchInterval: 60000 });
  const tag = data?.find(t => t.user_id === userId);
  return tag ? <RewardTag name={tag.name} textColor={tag.text_color} backgroundColor={tag.background_color} effect={tag.effect} season={tag.season_number} /> : null;
}
export function ProfileTags({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["profile-tags", userId], queryFn: async () => {
    const result = await supabase.from("player_profile_tags").select("equipped,seasons(number),profile_tags(id,name,text_color,background_color,effect)").eq("user_id", userId).order("granted_at");
    if (result.error) throw result.error; return result.data;
  }, staleTime: 30000 });
  if (!data?.length) return null;
  async function equip(tag: string | null) {
    if (busy) return; setBusy(true);
    try { const r = await supabase.rpc("equip_profile_tag", tag ? { p_tag: tag } : {}); if (r.error) throw r.error; await Promise.all([qc.invalidateQueries({ queryKey: ["profile-tags"] }), qc.invalidateQueries({ queryKey: ["equipped-profile-tags"] })]); } catch { toast.error("Não consegui trocar o título."); } finally { setBusy(false); }
  }
  return <section className="mt-4 border-t border-border pt-4"><h3 className="mb-3 text-sm font-semibold">Meus títulos</h3><div className="flex flex-wrap gap-2" aria-label="Títulos do jogador"><Button size="sm" variant={!data.some(r => r.equipped) ? "default" : "outline"} disabled={busy} onClick={() => equip(null)}>Sem título</Button>{data.map(row => row.profile_tags && <Button key={row.profile_tags.id} size="sm" variant={row.equipped ? "default" : "outline"} aria-pressed={row.equipped} disabled={busy} onClick={() => equip(row.profile_tags?.id ?? null)}><RewardTag name={row.profile_tags.name} textColor={row.profile_tags.text_color} backgroundColor={row.profile_tags.background_color} effect={row.profile_tags.effect} season={row.seasons?.number} /></Button>)}</div></section>;
}