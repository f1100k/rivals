import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Flag, Play, Trash2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEASONS_KEY, fetchSeasons, fmtDate, nextSeasonNumber, seasonError, type Season } from "@/lib/seasons";

/** ISO → value for <input type="date"> (Brasília day). */
const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : "");
/** <input type="date"> value → midday in Brasília so the day never shifts. */
const fromDateInput = (v: string) => (v ? new Date(`${v}T12:00:00-03:00`).toISOString() : null);

const STATUS: Record<Season["status"], { label: string; cls: string }> = {
  planned: { label: "Ainda não começou", cls: "border-border text-muted-foreground" },
  active: { label: "Em andamento", cls: "border-primary bg-primary/15 text-primary" },
  finished: { label: "Finalizada", cls: "border-border bg-muted/40 text-foreground" },
};

export function AdminSeasons() {
  const qc = useQueryClient();
  const { data: seasons = [] } = useQuery({ queryKey: SEASONS_KEY, queryFn: fetchSeasons });
  const [busy, setBusy] = useState(false);
  const [number, setNumber] = useState<string>("");
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const active = seasons.find((s) => s.status === "active");
  const suggested = nextSeasonNumber(seasons);

  async function run(fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    if (busy) return false;
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: SEASONS_KEY }), qc.invalidateQueries({ queryKey: ["player-seasons"] }), qc.invalidateQueries({ queryKey: ["equipped-profile-tags"] })]);
      toast.success(ok);
      return true;
    } catch (e) { toast.error(seasonError(e)); return false; } finally { setBusy(false); }
  }

  async function create() {
    const n = number === "" ? suggested : Number(number);
    if (!Number.isInteger(n) || n < 0) { toast.error("Coloque um número de season válido (0 ou mais)."); return; }
    if (start && end && end <= start) { toast.error("O fim precisa ser depois do início."); return; }
    const done = await run(() => supabase.rpc("admin_save_season", { p_id: null as unknown as string, p_number: n, p_name: name.trim() || `Season ${n}`, p_planned_start: fromDateInput(start) as string, p_planned_end: fromDateInput(end) as string }), `Season ${n} criada. Agora é só iniciar quando quiser.`);
    if (done) { setNumber(""); setName(""); setStart(""); setEnd(""); }
  }

  function startSeason(s: Season) {
    const fromBeginning = confirm(
      `Iniciar ${s.name}?\n\nOK = contar TUDO desde o começo do site (use isso na Season 0).\nCancelar = escolher começar do zero agora.`,
    );
    if (!fromBeginning && !confirm(`${s.name} vai começar a contar a partir de AGORA (vitórias, derrotas, gols e conquistas novas).\n\nConfirmar?`)) return;
    void run(() => supabase.rpc("admin_start_season", { p_id: s.id, p_from_beginning: fromBeginning }), `${s.name} começou!`);
  }

  function finishSeason(s: Season) {
    const typed = prompt(`Finalizar ${s.name}?\n\nAs estatísticas e conquistas de cada jogador ficam guardadas no perfil dele, ligadas à ${s.name}. Depois o MMR, as vitórias, as derrotas e as sequências de todo mundo voltam a zero, e a próxima season começa sozinha na mesma hora. Moedas, itens e protetores continuam. Isso não pode ser desfeito.\n\nDigite FINALIZAR para confirmar.`);
    if (typed?.trim().toUpperCase() !== "FINALIZAR") { if (typed !== null) toast.error("Digite FINALIZAR para confirmar."); return; }
    void run(() => supabase.rpc("admin_finish_season", { p_id: s.id }), `${s.name} finalizada. As estatísticas foram guardadas, todo mundo voltou a zero e a próxima season já começou.`);
  }

  return (
    <section className="mt-4 space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Trophy className="h-5 w-5 text-primary" /> Como funcionam as seasons</h3>
        <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-lg border border-border p-3"><p className="font-display text-2xl font-bold text-primary">1</p><p className="font-semibold">Criar</p><p className="text-muted-foreground">Escolha o número (Season 0, 1, 2…) e, se quiser, as datas de início e fim para mostrar aos jogadores.</p></li>
          <li className="rounded-lg border border-border p-3"><p className="font-display text-2xl font-bold text-primary">2</p><p className="font-semibold">Iniciar</p><p className="text-muted-foreground">A partir daí, vitórias, derrotas, gols, MVPs e títulos entregues contam para essa season. Só uma fica ativa por vez.</p></li>
          <li className="rounded-lg border border-border p-3"><p className="font-display text-2xl font-bold text-primary">3</p><p className="font-semibold">Finalizar</p><p className="text-muted-foreground">Tudo o que cada jogador fez fica guardado no perfil dele, com a posição final e o MMR. Depois todo mundo volta a zero e a próxima season começa sozinha na mesma hora.</p></li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">Ao finalizar, MMR, vitórias, derrotas e sequências zeram, e as recompensas de subir de divisão podem ser ganhas de novo. Moedas, molduras, tags, emblemas e protetores continuam. No Ranking, nas Partidas e no perfil dá para escolher a season para ver como ficou.</p>
      </div>

      <div className={`rounded-xl border p-4 ${active ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Agora</p>
        {active ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-2xl font-bold">{active.name} em andamento</p>
              <p className="text-sm text-muted-foreground">Contando desde {fmtDate(active.started_at)}{active.planned_end ? ` · fim previsto ${fmtDate(active.planned_end)}` : ""}</p>
            </div>
            <Button variant="destructive" disabled={busy} onClick={() => finishSeason(active)}><Flag size={16} />Finalizar {active.name}</Button>
          </div>
        ) : <p className="mt-1 font-semibold">Nenhuma season em andamento. Crie uma abaixo e clique em Iniciar.</p>}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold"><CalendarPlus className="h-5 w-5 text-primary" /> Criar season</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-sm">Número<Input className="mt-1" type="number" min={0} placeholder={String(suggested)} value={number} onChange={(e) => setNumber(e.target.value)} /></label>
          <label className="text-sm">Nome<Input className="mt-1" maxLength={40} placeholder={`Season ${number === "" ? suggested : number}`} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="text-sm">Começa em<Input className="mt-1" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="text-sm">Termina em<Input className="mt-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">As datas são só para os jogadores saberem. A season começa e termina quando você clicar em Iniciar e Finalizar.</p>
        <div className="mt-3 flex justify-end"><Button disabled={busy} onClick={create}>Criar Season {number === "" ? suggested : number}</Button></div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <h3 className="border-b border-border p-4 font-display text-lg font-bold">Todas as seasons</h3>
        {seasons.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma season criada ainda.</p> : (
          <ul className="divide-y divide-border">
            {seasons.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.status === "finished" ? `${fmtDate(s.started_at)} até ${fmtDate(s.finished_at)} · ${s.players} jogadores guardados`
                      : s.status === "active" ? `Contando desde ${fmtDate(s.started_at)}`
                      : s.planned_start || s.planned_end ? `Previsto: ${fmtDate(s.planned_start) ?? "?"} até ${fmtDate(s.planned_end) ?? "?"}` : "Sem datas"}
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                {s.status === "planned" && <>
                  <Button size="sm" disabled={busy || Boolean(active)} title={active ? "Finalize a season atual primeiro" : undefined} onClick={() => startSeason(s)}><Play size={14} />Iniciar</Button>
                  <Button size="sm" variant="ghost" aria-label={`Apagar ${s.name}`} disabled={busy} onClick={() => { if (confirm(`Apagar ${s.name}?`)) void run(() => supabase.rpc("admin_delete_season", { p_id: s.id }), `${s.name} apagada.`); }}><Trash2 size={14} /></Button>
                </>}
                {s.status === "active" && <Button size="sm" variant="destructive" disabled={busy} onClick={() => finishSeason(s)}><Flag size={14} />Finalizar</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
