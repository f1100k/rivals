import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Gift, Pencil, Minus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AdminOverview } from "@/lib/inhouse.functions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { RewardTag, type TagEffect } from "./ProfileTags";
import { SEASONS_KEY, fetchSeasons } from "@/lib/seasons";

export function AdminProfileTags({ users }: { users: AdminOverview["users"] }) {
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("#ffffff");
  const [background, setBackground] = useState("#b93838");
  const [effect, setEffect] = useState<TagEffect>("none");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: seasons = [] } = useQuery({ queryKey: SEASONS_KEY, queryFn: fetchSeasons });
  const activeSeason = seasons.find(s => s.status === "active");
  const [seasonChoice, setSeasonChoice] = useState<string>("auto");
  const grantSeason = seasonChoice === "auto" ? activeSeason?.id ?? null : seasonChoice;
  const { data: tags, error } = useQuery({ queryKey: ["admin-profile-tags"], queryFn: async () => {
    const r = await supabase.from("profile_tags").select("*").order("created_at"); if (r.error) throw r.error; return r.data;
  }});
  async function save() {
    if (busy || !name.trim()) return; setBusy(true);
    try {
      const r = await supabase.rpc("admin_save_profile_tag", { p_id: id ?? crypto.randomUUID(), p_name: name, p_text: text, p_background: background, p_effect: effect });
      if (r.error) throw r.error; setId(r.data); await qc.invalidateQueries({ queryKey: ["admin-profile-tags"] }); await qc.invalidateQueries({ queryKey: ["profile-tags"] }); toast.success("Título salvo.");
    } catch { toast.error("Não consegui salvar o título."); } finally { setBusy(false); }
  }
  async function grant(remove: boolean) {
    if (!id || !selected.length || busy) return; setBusy(true);
    try {
      const r = await supabase.rpc("admin_grant_profile_tag_season", { p_tag: id, p_users: selected, p_remove: remove, p_season: grantSeason as string });
      if (r.error) throw r.error; await qc.invalidateQueries({ queryKey: ["profile-tags"] }); await qc.invalidateQueries({ queryKey: ["player-seasons"] }); await qc.invalidateQueries({ queryKey: ["equipped-profile-tags"] }); toast.success(remove ? "Título retirado dos jogadores selecionados." : "Título entregue aos jogadores selecionados.");
    } catch { toast.error("Não consegui alterar os títulos dos jogadores."); } finally { setBusy(false); }
  }
  return <section className="mt-6">
    <div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-bold">Tags e títulos</h2><Button variant="outline" disabled={busy} onClick={() => { setId(null); setName(""); setEffect("none"); setSelected([]); }}><Plus size={16} />Novo título</Button></div>
    <div className="mt-6 grid gap-8 lg:grid-cols-2">
      <div className="space-y-4 border-t border-border pt-5">
        <label className="block text-sm">Nome do título<Input aria-label="Nome do título" value={name} maxLength={40} onChange={e => setName(e.target.value)} /></label>
        <div className="flex flex-wrap gap-6"><label className="flex items-center gap-3 text-sm">Cor da letra<input aria-label="Cor da letra" type="color" value={text} onChange={e => setText(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-border bg-background" /></label><label className="flex items-center gap-3 text-sm">Cor do quadradinho<input aria-label="Cor do quadradinho" type="color" value={background} onChange={e => setBackground(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-border bg-background" /></label></div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" aria-label="Brilho verde especial" checked={effect === "glow-green"} onChange={e => setEffect(e.target.checked ? "glow-green" : "none")} />Brilho verde especial (apoiador)</label>
        <div className="flex min-h-16 items-center border-y border-border py-4"><RewardTag name={name || "Seu título"} textColor={text} backgroundColor={background} effect={effect} /></div>
        <Button disabled={busy || !name.trim()} onClick={save}><Save size={16} />Salvar título</Button>
        {error && <p role="alert" className="text-destructive">Não consegui carregar os títulos.</p>}
        <ul className="divide-y divide-border">{tags?.map(tag => <li key={tag.id} className="flex items-center justify-between gap-3 py-3"><RewardTag name={tag.name} textColor={tag.text_color} backgroundColor={tag.background_color} effect={tag.effect} /><Button size="icon" variant={id === tag.id ? "default" : "ghost"} aria-label={`Selecionar título ${tag.name}`} title="Editar e entregar título" disabled={busy} onClick={() => { setId(tag.id); setName(tag.name); setText(tag.text_color); setBackground(tag.background_color); setEffect(tag.effect === "glow-green" ? "glow-green" : "none"); }}><Pencil size={16} /></Button></li>)}</ul>
      </div>
      <div className="space-y-4 border-t border-border pt-5"><h3 className="font-display text-xl font-bold">Entregar recompensa</h3><p className="text-sm text-muted-foreground">{id ? name : "Selecione um título salvo"} · {selected.length} jogadores selecionados</p><label className="block text-sm">Season do título<select aria-label="Season do título" value={seasonChoice} onChange={e => setSeasonChoice(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="auto">{activeSeason ? `Season atual (${activeSeason.name})` : "Season atual (nenhuma ativa)"}</option>{seasons.filter(s => s.status !== "planned").map(s => <option key={s.id} value={s.id}>{s.name}{s.status === "finished" ? " (finalizada)" : ""}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">O título aparece com a season ao lado do nome (ex.: “1º lugar · S0”) e entra nas conquistas dessa season no perfil.</span></label><Input aria-label="Buscar jogador para título" placeholder="Buscar jogador…" value={search} onChange={e => setSearch(e.target.value)} /><div className="max-h-80 overflow-y-auto divide-y divide-border">{users.filter(u => !u.isGhost && u.name.toLowerCase().includes(search.toLowerCase())).map(u => <label key={u.id} className="flex items-center gap-3 py-3 text-sm"><input type="checkbox" checked={selected.includes(u.id)} onChange={e => setSelected(e.target.checked ? [...selected, u.id] : selected.filter(v => v !== u.id))} />{u.name}</label>)}</div><div className="flex flex-wrap gap-2"><Button disabled={!id || !selected.length || busy} onClick={() => grant(false)}><Gift size={16} />Entregar título</Button><Button variant="outline" disabled={!id || !selected.length || busy} onClick={() => grant(true)}><Minus size={16} />Retirar título</Button></div></div>
    </div>
  </section>;
}