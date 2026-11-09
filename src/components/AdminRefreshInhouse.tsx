import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";

interface RefreshSummary { removedOffline: number; activeMatches: number; drafts: number; newMatches: number; queue: number; testQueue: number }

/** Admin-only: re-runs queue/match maintenance (offline sweep, kick votes, vacancies, draft timers, matchmaking) and reloads every screen's data. */
export function AdminRefreshInhouse() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_refresh_inhouse_gk");
      if (error) throw new Error(error.message);
      const r = data as unknown as RefreshSummary;
      await qc.invalidateQueries();
      toast.success("Filas e partidas atualizadas.", {
        description: `${r.queue} na fila · ${r.activeMatches} partida(s) ao vivo · ${r.newMatches} nova(s) · ${r.removedOffline} removido(s) por inatividade`,
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui atualizar."); }
    finally { setBusy(false); }
  }
  return <Button variant="outline" disabled={busy} onClick={run} title="Retira quem ficou inativo, fecha votações vencidas, preenche vagas, avança drafts parados e forma partidas com a fila cheia">
    <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Atualizando…" : "Atualizar filas e partidas"}
  </Button>;
}
