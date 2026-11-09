import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMixState } from "@/components/MixMode";
import { MIX_STATE_KEY, mixStatusText } from "@/lib/mix";

const ERRORS: Record<string, string> = {
  sem_permissao: "Apenas admins podem mudar o Mix.",
  horario_incompleto: "Preencha o início e o fim.",
  fim_antes_do_inicio: "O fim precisa ser depois do início.",
};
const msg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? m;
};
/** ISO → value for <input type="datetime-local"> in the browser's local time. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function AdminMix() {
  const qc = useQueryClient();
  const { data } = useMixState();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setStart(toLocalInput(data.startsAt)); setEnd(toLocalInput(data.endsAt)); } }, [data?.startsAt, data?.endsAt]);

  async function save(manualOn: boolean, startsAt: string | null, endsAt: string | null, ok: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_set_mix", { p_manual_on: manualOn, p_starts: startsAt as string, p_ends: endsAt as string });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: MIX_STATE_KEY });
      toast.success(ok);
    } catch (e) { toast.error(msg(e)); } finally { setBusy(false); }
  }

  function schedule() {
    if (!start || !end) { toast.error(ERRORS["horario_incompleto"]); return; }
    const s = new Date(start), e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) { toast.error(ERRORS["fim_antes_do_inicio"]); return; }
    void save(false, s.toISOString(), e.toISOString(), "Horário do Mix salvo.");
  }

  const status = mixStatusText(data);
  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-lg font-bold">Modo Mix</h3>
      <p className="text-sm text-muted-foreground">Com o Mix ligado, os 2 maiores MMR viram capitães e o resto é sorteado na hora, equilibrado pelo MMR (cada time com 1 goleiro). As partidas contam só no Ranking Mix e não mexem no MMR. Uma partida que já começou continua como estava.</p>
      <div className={`mt-3 rounded-lg border p-3 ${data?.active ? "border-primary/50 bg-primary/10" : "border-border"}`}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Agora</p>
        <p className="font-semibold">{data?.active ? "Mix ligado" : "Mix desligado"}</p>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={busy || data?.manualOn} onClick={() => save(true, null, null, "Mix ligado agora.")}>Ligar agora</Button>
        <Button variant="outline" disabled={busy || (!data?.active && !data?.startsAt)} onClick={() => { if (confirm("Desligar o Mix e apagar o horário programado?")) void save(false, null, null, "Mix desligado."); }}>Desligar</Button>
      </div>
      <h4 className="mt-5 text-sm font-semibold">Programar horário</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Começa em
          <Input className="mt-1" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-sm">Termina em
          <Input className="mt-1" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={schedule} disabled={busy || !start || !end}>{busy ? "Salvando…" : "Salvar horário"}</Button>
      </div>
    </section>
  );
}
