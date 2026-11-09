import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { decideKick } from "./MatchKick";
import type { PendingKick } from "@/lib/match-kick";

const STATUS: Record<string, string> = { draft: "Escolha de times", room: "Em jogo", voting: "Votação", reporting: "Resultado", disputed: "Contestada" };

async function fetchPending(): Promise<PendingKick[]> {
  // The database checks the admin role.
  const { data, error } = await supabase.rpc("admin_pending_kicks_gk");
  if (error) throw new Error(error.message);
  return (data as unknown as PendingKick[] | null) ?? [];
}

/** Expulsions approved by player majority that wait for an admin's final word. Renders nothing when empty. */
export function AdminKickApprovals() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["admin-pending-kicks"], queryFn: fetchPending, refetchInterval: 5000, retry: false });
  if (!data?.length) return null;

  async function decide(k: PendingKick, approve: boolean) {
    if (busy) return;
    setBusy(k.id);
    try {
      await decideKick(k.id, approve);
      toast.success(approve ? `${k.targetName ?? "Jogador"} foi removido e o próximo da fila entra na vaga.` : `${k.targetName ?? "Jogador"} continua na partida.`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-pending-kicks"] }), qc.invalidateQueries({ queryKey: ["admin"] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui registrar a decisão."); }
    finally { setBusy(null); }
  }

  return <section className="mt-6 rounded-xl border-2 border-destructive/50 bg-destructive/10 p-5" aria-label="Expulsões aguardando aprovação">
    <h2 className="flex items-center gap-2 font-display text-xl font-bold"><UserMinus className="size-5 text-destructive" />Expulsões aguardando sua aprovação</h2>
    <p className="mt-1 text-sm text-muted-foreground">Os jogadores votaram pela expulsão. A partida fica pausada até um admin decidir.</p>
    <ul className="mt-4 space-y-3">
      {data.map(k => <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="font-semibold">Expulsar <span className="text-destructive">{k.targetName ?? "Jogador"}</span></p>
          <p className="text-xs text-muted-foreground">Pedido por {k.startedByName ?? "jogador"} · {k.yes} sim · {k.no} não · {STATUS[k.matchStatus] ?? k.matchStatus} · partida #{k.matchId.slice(0, 8)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => decide(k, true)}>Aprovar expulsão</Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => decide(k, false)}>Manter jogador</Button>
        </div>
      </li>)}
    </ul>
  </section>;
}
