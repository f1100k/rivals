import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AdminOverview } from "@/lib/inhouse.functions";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

export function AdminPermissions({ users }: { users: AdminOverview["users"] }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data: grants, error } = useQuery({
    queryKey: ["admin-feature-grants"],
    queryFn: async () => {
      const r = await supabase.from("user_feature_grants").select("user_id, feature");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const has = (userId: string, feature: FeatureKey) => !!grants?.some(g => g.user_id === userId && g.feature === feature);

  async function toggle(userId: string, name: string, feature: FeatureKey, on: boolean) {
    const key = `${userId}:${feature}`;
    if (busy) return;
    setBusy(key);
    try {
      const r = await supabase.rpc("admin_set_feature", { p_user: userId, p_feature: feature, p_on: on });
      if (r.error) throw r.error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-feature-grants"] }), qc.invalidateQueries({ queryKey: ["has-feature"] })]);
      const label = FEATURES.find(f => f.key === feature)?.label;
      toast.success(on ? `${label} liberado para ${name}.` : `${label} retirado de ${name}.`);
    } catch { toast.error("Não consegui alterar a permissão."); }
    finally { setBusy(null); }
  }

  const players = users.filter(u => !u.isGhost && u.name.toLowerCase().includes(search.trim().toLowerCase()));
  const counts = Object.fromEntries(FEATURES.map(f => [f.key, grants?.filter(g => g.feature === f.key).length ?? 0]));

  return <section className="mt-6">
    <h2 className="font-display text-2xl font-bold">Permissões</h2>
    <p className="mt-1 text-sm text-muted-foreground">Libere funcionalidades para jogadores específicos. Admins já têm tudo liberado. O jogador recebe uma notificação quando ganha uma permissão.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {FEATURES.map(f => <div key={f.key} className="rounded-lg border border-border bg-card p-4">
        <p className="font-semibold">{f.label}</p>
        <p className="text-sm text-muted-foreground">{f.description}</p>
        <p className="mt-2 text-xs text-primary">{counts[f.key]} jogador(es) liberado(s)</p>
      </div>)}
    </div>
    <Input className="mt-5" aria-label="Buscar jogador para permissões" placeholder="Buscar jogador…" value={search} onChange={e => setSearch(e.target.value)} />
    {error && <p role="alert" className="mt-3 text-destructive">Não consegui carregar as permissões.</p>}
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead><tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-2 font-medium">Jogador</th>
          {FEATURES.map(f => <th key={f.key} className="py-2 text-center font-medium">{f.label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-border">
          {players.map(u => <tr key={u.id}>
            <td className="max-w-48 truncate py-2.5">{u.name}</td>
            {FEATURES.map(f => <td key={f.key} className="py-2.5 text-center">
              <Switch aria-label={`${f.label} para ${u.name}`} checked={has(u.id, f.key)} disabled={!grants || busy !== null} onCheckedChange={on => toggle(u.id, u.name, f.key, on)} />
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
