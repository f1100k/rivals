import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTDOWN_QUERY_KEY, fetchActiveCountdown } from "@/components/SiteCountdown";

const ERRORS: Record<string, string> = {
  sem_permissao: "Apenas admins podem alterar o contador.",
  texto_obrigatorio: "Escreva um texto para o contador.",
  data_no_passado: "Escolha uma data e hora no futuro.",
};
const msg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? m;
};

export function AdminCountdown() {
  const qc = useQueryClient();
  const { data: current } = useQuery({ queryKey: COUNTDOWN_QUERY_KEY, queryFn: fetchActiveCountdown });
  const [label, setLabel] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy || !label.trim() || !endsAt) return;
    const when = new Date(endsAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) { toast.error(ERRORS["data_no_passado"]); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_set_countdown", { p_label: label.trim(), p_ends_at: when.toISOString() });
      if (error) throw error;
      setLabel(""); setEndsAt("");
      await qc.invalidateQueries({ queryKey: COUNTDOWN_QUERY_KEY });
      toast.success("Contador publicado para todos.");
    } catch (e) { toast.error(msg(e)); } finally { setBusy(false); }
  }

  async function clear() {
    if (busy || !confirm("Remover o contador da tela de todos?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_clear_countdown");
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: COUNTDOWN_QUERY_KEY });
      toast.success("Contador removido.");
    } catch (e) { toast.error(msg(e)); } finally { setBusy(false); }
  }

  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-lg font-bold">Contador</h3>
      <p className="text-sm text-muted-foreground">Aparece fixo no canto inferior esquerdo da tela de todos, acompanhando a rolagem. Publicar um novo substitui o atual.</p>
      {current && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">No ar agora</p>
            <p className="font-semibold">{current.label}</p>
            <p className="text-sm text-muted-foreground">Termina em {new Date(current.ends_at).toLocaleString("pt-BR")}</p>
          </div>
          <Button variant="destructive" size="sm" disabled={busy} onClick={clear}>Remover contador</Button>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="text-sm">Texto
          <Input className="mt-1" maxLength={120} placeholder="Ex.: Campeonato começa em" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="text-sm">Termina em
          <Input className="mt-1" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={save} disabled={busy || !label.trim() || !endsAt}>{busy ? "Salvando…" : current ? "Substituir contador" : "Publicar contador"}</Button>
      </div>
    </section>
  );
}
