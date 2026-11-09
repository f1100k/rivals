import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Flag, Swords, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_MIN_GAMES, LEAGUE_EVENTS_KEY, dayEndExclusive, dayStart, fetchLeagueEvents, leagueError, leagueRangeLabel, nextWeekDates, type LeagueEvent } from "@/lib/league";

export function AdminLeague() {
  const qc = useQueryClient();
  const { data: events = [] } = useQuery({ queryKey: LEAGUE_EVENTS_KEY, queryFn: fetchLeagueEvents });
  const week = nextWeekDates();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Rivals League");
  const [start, setStart] = useState(week.start);
  const [end, setEnd] = useState(week.end);
  const [min, setMin] = useState(String(DEFAULT_MIN_GAMES));

  async function run(fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    if (busy) return false;
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: LEAGUE_EVENTS_KEY }), qc.invalidateQueries({ queryKey: ["league-ranking"] })]);
      toast.success(ok);
      return true;
    } catch (e) { toast.error(leagueError(e)); return false; } finally { setBusy(false); }
  }

  function create() {
    const m = Number(min);
    if (!start || !end || end < start) { toast.error("O último dia precisa ser depois do primeiro."); return; }
    if (!Number.isInteger(m) || m < 1 || m > 200) { toast.error("O mínimo de partidas precisa ser entre 1 e 200."); return; }
    void run(() => supabase.rpc("admin_save_league_event", { p_id: null as unknown as string, p_name: name.trim() || "Rivals League", p_starts: dayStart(start), p_ends: dayEndExclusive(end), p_min_games: m }), "Evento criado. Já aparece no Ranking.");
  }

  function finish(e: LeagueEvent) {
    const typed = prompt(`Finalizar ${e.name} (${leagueRangeLabel(e)})?\n\nO ranking fica guardado do jeito que está agora, e partidas novas param de contar. Isso não pode ser desfeito.\n\nDigite FINALIZAR para confirmar.`);
    if (typed?.trim().toUpperCase() !== "FINALIZAR") { if (typed !== null) toast.error("Digite FINALIZAR para confirmar."); return; }
    void run(() => supabase.rpc("admin_finish_league_event", { p_id: e.id }), `${e.name} finalizada e guardada.`);
  }

  return (
    <section className="mt-4 space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Swords className="h-5 w-5 text-primary" /> Como funciona a Rivals League</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>É um ranking separado, de segunda 00:00 até domingo à meia-noite (horário de Brasília). O MMR continua contando normal no ranking Inhouse e no Mix.</li>
          <li>Ordena pelo MMR ganho só nas partidas da fila normal dentro do evento. Mix e partidas de teste não contam.</li>
          <li>Só entra no ranking quem jogar o mínimo de partidas. Quem ainda não chegou aparece embaixo, com quantas faltam.</li>
          <li>Ao finalizar, o resultado fica guardado e continua aparecendo no Ranking, na caixinha de escolher.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold"><CalendarPlus className="h-5 w-5 text-primary" /> Criar evento</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-sm">Nome<Input className="mt-1" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="text-sm">Primeiro dia (desde 00:00)<Input className="mt-1" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="text-sm">Último dia (até meia-noite)<Input className="mt-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          <label className="text-sm">Mínimo de partidas<Input className="mt-1" type="number" min={1} max={200} value={min} onChange={(e) => setMin(e.target.value)} /></label>
        </div>
        <div className="mt-3 flex justify-end"><Button disabled={busy} onClick={create}>Criar evento</Button></div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <h3 className="border-b border-border p-4 font-display text-lg font-bold">Eventos</h3>
        {events.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum evento criado ainda.</p> : (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{leagueRangeLabel(e)} · mínimo {e.min_games} partidas</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${e.status === "active" ? "border-primary bg-primary/15 text-primary" : "border-border bg-muted/40 text-foreground"}`}>{e.status === "active" ? "Ao vivo" : "Finalizada"}</span>
                {e.status === "active" && <Button size="sm" variant="destructive" disabled={busy} onClick={() => finish(e)}><Flag size={14} />Finalizar</Button>}
                <Button size="sm" variant="ghost" aria-label={`Apagar ${e.name}`} disabled={busy} onClick={() => { if (confirm(`Apagar ${e.name} (${leagueRangeLabel(e)})? O ranking dele some.`)) void run(() => supabase.rpc("admin_delete_league_event", { p_id: e.id }), "Evento apagado."); }}><Trash2 size={14} /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
