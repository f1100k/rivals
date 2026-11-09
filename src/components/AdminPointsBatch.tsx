import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageUp, Loader2, Minus, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { readPrintPlayerNames } from "@/lib/admin-points.functions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type User = { id: string; name: string; rating: number; isGhost: boolean };
/** One line in the batch: a site player (or an unmatched print name waiting for a pick). */
type Row = {
  key: string;
  userId: string | null;
  printName?: string | undefined;
  delta: number;
  winsDelta: number;
  lossesDelta: number;
  request: string;
  recordRequest: string;
};
type Tally = { wins: number; losses: number };

const MAX = 100000;
const MAX_RECORD = 10000;

/** New rating after a delta, never below zero (same floor as the database). */
export function previewRating(rating: number, delta: number) {
  return Math.max(0, rating + delta);
}

/** New win or loss total after a delta, never below zero (same floor as the database). */
export function previewCount(current: number, delta: number) {
  return Math.max(0, current + delta);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não consegui abrir a imagem."));
    r.readAsDataURL(file);
  });
}

const intOk = (n: number, max: number) => Number.isInteger(n) && Math.abs(n) <= max;

export function AdminPointsBatch({ users }: { users: User[] }) {
  const players = useMemo(() => users.filter((u) => !u.isGhost).sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const recordsQuery = useQuery({
    queryKey: ["admin", "records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, wins, losses").eq("is_ghost", false);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.id, { wins: r.wins, losses: r.losses } as Tally]));
    },
  });
  const records = recordsQuery.data;
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState(15);
  const [winsAll, setWinsAll] = useState(0);
  const [lossesAll, setLossesAll] = useState(0);
  const [reason, setReason] = useState("Ajuste pelo painel");
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const readNames = useServerFn(readPrintPlayerNames);
  const qc = useQueryClient();

  const signed = mode === "add" ? amount : -amount;
  const amountOk = Number.isInteger(amount) && amount >= 0 && amount <= MAX;
  const recordAllOk = intOk(winsAll, MAX_RECORD) && intOk(lossesAll, MAX_RECORD);
  const chosen = new Set(rows.map((r) => r.userId).filter(Boolean));
  const matches = search.trim() ? players.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()) && !chosen.has(p.id)).slice(0, 8) : [];
  const ready = rows.filter((r) => r.userId && (r.delta !== 0 || r.winsDelta !== 0 || r.lossesDelta !== 0));
  const valid =
    ready.length > 0 &&
    reason.trim().length >= 3 &&
    rows.every((r) => !r.userId || (intOk(r.delta, MAX) && intOk(r.winsDelta, MAX_RECORD) && intOk(r.lossesDelta, MAX_RECORD))) &&
    (ready.every((r) => r.winsDelta === 0 && r.lossesDelta === 0) || !!records);

  function newRow(userId: string | null, printName?: string): Row {
    return {
      key: crypto.randomUUID(),
      userId,
      printName,
      delta: amountOk ? signed : 0,
      winsDelta: recordAllOk ? winsAll : 0,
      lossesDelta: recordAllOk ? lossesAll : 0,
      request: crypto.randomUUID(),
      recordRequest: crypto.randomUUID(),
    };
  }
  function addPlayer(id: string) {
    if (chosen.has(id)) return;
    setRows((rs) => [...rs, newRow(id)]);
    setSearch("");
  }
  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, request: crypto.randomUUID(), recordRequest: crypto.randomUUID() } : r)));
  }
  function applyToAll() {
    if (!amountOk || !recordAllOk) return;
    setRows((rs) => rs.map((r) => ({ ...r, delta: signed, winsDelta: winsAll, lossesDelta: lossesAll, request: crypto.randomUUID(), recordRequest: crypto.randomUUID() })));
  }

  async function readPrint(file: File) {
    if (reading) return;
    setReading(true);
    try {
      const image = await fileToDataUrl(file);
      const { players: found } = await readNames({ data: { image } });
      let added = 0;
      setRows((rs) => {
        const have = new Set(rs.map((r) => r.userId).filter(Boolean));
        const next = [...rs];
        for (const f of found) {
          if (f.userId && have.has(f.userId)) continue;
          if (f.userId) have.add(f.userId);
          next.push(newRow(f.userId, f.printName));
          added++;
        }
        return next;
      });
      const missing = found.filter((f) => !f.userId).length;
      toast.success(`${found.length} nome(s) lido(s) no print.${missing ? ` ${missing} sem conta encontrada: escolha o jogador na lista.` : ""}`);
      if (!added) toast.message("Todos esses jogadores já estavam na lista.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui ler o print.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Ctrl+V anywhere on this tab reads a pasted print, same as the queue screen.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file || reading || saving) return;
      e.preventDefault();
      toast.message("Print colado. Lendo os nomes…");
      void readPrint(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    const done: string[] = [];
    const failed: string[] = [];
    for (const r of ready) {
      const p = byId.get(r.userId!);
      let ok = true;
      if (r.delta !== 0) {
        const { error } = await supabase.rpc("admin_adjust_rating", { p_user: r.userId!, p_delta: r.delta, p_reason: reason.trim(), p_request: r.request });
        if (error) ok = false;
      }
      if (ok && (r.winsDelta !== 0 || r.lossesDelta !== 0)) {
        const { error } = await supabase.rpc("admin_adjust_record", {
          p_user: r.userId!,
          p_wins_delta: r.winsDelta,
          p_losses_delta: r.lossesDelta,
          p_reason: reason.trim(),
          p_request: r.recordRequest,
        });
        if (error) ok = false;
      }
      if (ok) done.push(r.key);
      else failed.push(p?.name ?? "?");
    }
    await Promise.all(["admin", "ranking", "my-profile", "inicio", "inhouse-gk", "player-profile"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
    setRows((rs) => rs.filter((r) => !done.includes(r.key)));
    if (done.length) toast.success(`Ajuste salvo para ${done.length} jogador(es).`);
    if (failed.length) toast.error(`Não foi possível ajustar: ${failed.join(", ")}.`);
    setSaving(false);
  }

  return (
    <section className="mt-4 grid gap-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-xl font-bold">Pontos, vitórias e derrotas</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mande um print para a IA achar os jogadores, ou escreva o nome. Dá para mexer no MMR e no total de vitórias e derrotas de cada um.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <span className="text-sm font-semibold">Pelo print</span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Enviar print dos jogadores" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readPrint(f); }} />
            <Button variant="outline" disabled={reading || saving} onClick={() => fileRef.current?.click()}>
              {reading ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
              {reading ? "Lendo o print…" : "Enviar print"}
            </Button>
            <span className="text-xs text-muted-foreground">Ou copie o print e aperte Ctrl+V aqui.</span>
          </div>
          <div className="relative grid gap-2">
            <span className="text-sm font-semibold">Pelo nome</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Nome do jogador" placeholder="Escreva o nome…" className="pl-9" value={search} disabled={saving} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) addPlayer(matches[0].id); }} />
            </div>
            {matches.length > 0 && (
              <ul className="absolute top-full z-20 mt-1 w-full divide-y divide-border overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                {matches.map((p) => {
                  const rec = records?.get(p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => addPlayer(p.id)}>
                        <UserPlus className="size-4 text-primary" /><span className="flex-1 font-semibold">{p.name}</span>
                        {rec && <span className="text-muted-foreground">{rec.wins}V · {rec.losses}D</span>}
                        <span className="text-muted-foreground">{p.rating} MMR</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {search.trim() && matches.length === 0 && <p className="text-xs text-muted-foreground">Nenhum jogador com esse nome.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid grid-cols-2 gap-2" aria-label="Tipo de ajuste">
            <Button variant={mode === "add" ? "default" : "outline"} aria-pressed={mode === "add"} disabled={saving} onClick={() => setMode("add")}><Plus className="size-4" />Adicionar</Button>
            <Button variant={mode === "remove" ? "destructive" : "outline"} aria-pressed={mode === "remove"} disabled={saving} onClick={() => setMode("remove")}><Minus className="size-4" />Tirar</Button>
          </div>
          <label className="grid gap-1 text-sm">Pontos<Input aria-label="Pontos para todos" type="number" min={0} max={MAX} className="w-24" value={amount} disabled={saving} onChange={(e) => setAmount(Number(e.target.value))} /></label>
          <label className="grid gap-1 text-sm">Vitórias (+/−)<Input aria-label="Vitórias para todos" type="number" className="w-24" value={winsAll} disabled={saving} onChange={(e) => setWinsAll(Number(e.target.value))} /></label>
          <label className="grid gap-1 text-sm">Derrotas (+/−)<Input aria-label="Derrotas para todos" type="number" className="w-24" value={lossesAll} disabled={saving} onChange={(e) => setLossesAll(Number(e.target.value))} /></label>
          <Button variant="secondary" disabled={!amountOk || !recordAllOk || !rows.length || saving} onClick={applyToAll}>Usar em todos</Button>
          <label className="grid min-w-48 flex-1 gap-1 text-sm">Motivo<Input aria-label="Motivo do ajuste" maxLength={500} value={reason} disabled={saving} onChange={(e) => setReason(e.target.value)} /></label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Ex.: "Vitórias 1" dá uma vitória a mais; "Derrotas -1" tira uma derrota. Na lista você também pode digitar o total certo de cada jogador.</p>

        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {rows.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nenhum jogador escolhido ainda.</li>}
          {rows.map((r) => {
            const p = r.userId ? byId.get(r.userId) : undefined;
            const rec = r.userId ? records?.get(r.userId) : undefined;
            const name = p?.name ?? r.printName;
            const winsTotal = rec ? previewCount(rec.wins, r.winsDelta) : null;
            const lossesTotal = rec ? previewCount(rec.losses, r.lossesDelta) : null;
            return (
              <li key={r.key} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-40 flex-1">
                  {p ? <span className="font-semibold">{p.name}</span> : (
                    <select aria-label={`Escolher jogador para ${r.printName}`} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value="" disabled={saving} onChange={(e) => e.target.value && update(r.key, { userId: e.target.value })}>
                      <option value="">Escolha o jogador…</option>
                      {players.filter((x) => !chosen.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  )}
                  {r.printName && <span className="block text-xs text-muted-foreground">No print: {r.printName}{!p && " · conta não encontrada"}</span>}
                  {rec && <span className="block text-xs text-muted-foreground">Hoje: {rec.wins} vitórias · {rec.losses} derrotas</span>}
                </div>
                <label className="grid gap-0.5 text-xs text-muted-foreground">Pontos
                  <Input aria-label={`Pontos de ${name}`} type="number" className="w-24" value={r.delta} disabled={saving || !p} onChange={(e) => update(r.key, { delta: Number(e.target.value) })} />
                </label>
                <label className="grid gap-0.5 text-xs text-muted-foreground">Vitórias
                  <Input aria-label={`Vitórias de ${name}`} type="number" min={0} className="w-20" value={winsTotal ?? ""} disabled={saving || !p || !rec} onChange={(e) => rec && update(r.key, { winsDelta: Number(e.target.value) - rec.wins })} />
                </label>
                <label className="grid gap-0.5 text-xs text-muted-foreground">Derrotas
                  <Input aria-label={`Derrotas de ${name}`} type="number" min={0} className="w-20" value={lossesTotal ?? ""} disabled={saving || !p || !rec} onChange={(e) => rec && update(r.key, { lossesDelta: Number(e.target.value) - rec.losses })} />
                </label>
                <div className="w-40 text-right">
                  <span className={`block font-semibold ${r.delta < 0 ? "text-destructive" : "text-primary"}`}>
                    {p ? `${p.rating} → ${Number.isInteger(r.delta) ? previewRating(p.rating, r.delta) : "—"} MMR` : "—"}
                  </span>
                  {rec && (r.winsDelta !== 0 || r.lossesDelta !== 0) && (
                    <span className="block text-xs text-muted-foreground">{rec.wins}V {rec.losses}D → {winsTotal}V {lossesTotal}D</span>
                  )}
                </div>
                <Button size="icon" variant="ghost" aria-label="Tirar da lista" disabled={saving} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="size-4" /></Button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {rows.length > 0 && <Button variant="ghost" disabled={saving} onClick={() => setRows([])}>Limpar lista</Button>}
          <Button disabled={!valid || saving} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirmar ({ready.length} jogador{ready.length === 1 ? "" : "es"})
          </Button>
        </div>
      </div>
    </section>
  );
}
