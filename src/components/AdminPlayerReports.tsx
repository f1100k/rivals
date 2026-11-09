import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getAdminPlayerReports, reviewPlayerReport } from "@/lib/player-reports.functions";

export function AdminPlayerReports() {
  const fetchFn = useServerFn(getAdminPlayerReports);
  const reviewFn = useServerFn(reviewPlayerReport);
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["admin-player-reports"], queryFn: () => fetchFn(), refetchInterval: 15000, retry: false });
  const [review, setReview] = useState<{ targetId: string; reportId: string | null; action: "dismiss" | "uphold" | "lift" } | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  async function save() {
    if (!review || pending) return;
    setPending(true);
    try {
      await reviewFn({ data: { ...review, reason } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-player-reports"] }), qc.invalidateQueries({ queryKey: ["admin"] })]);
      setReview(null); setReason(""); toast.success("Veredito registrado.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setPending(false); }
  }
  return (
    <section className="mt-6">
      <h2 className="text-xl font-bold">Denúncias</h2>
      <p className="mt-2 text-sm text-muted-foreground">Valide cada justificativa. Sete concordâncias mantidas da mesma partida confirmam a trollagem: −9 MMR adicionais, proteção bloqueada e banimento progressivo.</p>
      {error && <p className="mt-4 text-destructive">{error.message}</p>}
      {!data && !error && <p className="mt-4 text-muted-foreground">Carregando…</p>}
      {data?.length === 0 && <p className="mt-4 text-muted-foreground">Nenhuma denúncia recebida.</p>}
      {data?.map((u) => {
        const banned = u.bannedUntil === "permanent" || (u.bannedUntil && new Date(u.bannedUntil) > new Date());
        return <article key={u.targetId} className="mt-6 border-b border-border pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold">{u.name}</h3><p className="text-sm text-muted-foreground">{u.pending}/7 no ciclo atual · {u.strikes} punições</p></div>
            {banned && <Button variant="outline" onClick={() => { setReason(""); setReview({ targetId: u.targetId, reportId: null, action: "lift" }); }}>Remover punição</Button>}
          </div>
          {banned && <p className="mt-2 text-sm text-destructive">{u.bannedUntil === "permanent" ? "Ban permanente" : `Suspenso até ${new Date(u.bannedUntil ?? "").toLocaleString("pt-BR")}`}</p>}
          <ul className="mt-3 divide-y divide-border">
            {u.reports.map((r) => <li key={r.id} className="py-3">
              <p className="break-words text-sm font-semibold">Denunciado por: {r.reporterName ?? "Jogador indisponível"}</p>
              <p className="break-all text-xs text-muted-foreground">Conta: {r.reporterId}</p>
              <p className="text-xs text-muted-foreground">#{r.matchId.slice(0, 8)} · ciclo {r.cycle + 1} · {new Date(r.createdAt).toLocaleString("pt-BR")}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{r.reason}</p>
              {r.verdict && <p className="mt-1 text-sm text-muted-foreground">{r.dismissed ? "Descartada" : "Mantida"}: {r.verdict}</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" disabled={r.cycle !== u.cycle || (!!r.verdict && !r.dismissed)} onClick={() => { setReason(""); setReview({ targetId: u.targetId, reportId: r.id, action: "uphold" }); }}>Validar concordância</Button>
                <Button size="sm" variant="ghost" disabled={r.cycle !== u.cycle || r.dismissed} onClick={() => { setReason(""); setReview({ targetId: u.targetId, reportId: r.id, action: "dismiss" }); }}>Descartar</Button>
              </div>
            </li>)}
          </ul>
        </article>;
      })}
      <Dialog open={!!review} onOpenChange={(open) => { if (!open && !pending) setReview(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader><DialogTitle>Veredito do administrador</DialogTitle><DialogDescription>{review?.action === "lift" ? "Remover punição e iniciar um novo ciclo." : review?.action === "dismiss" ? "Descartar denúncia." : "Manter denúncia."}</DialogDescription></DialogHeader>
          <label htmlFor="verdict-reason" className="text-sm">Motivo do veredito</label>
          <Textarea id="verdict-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} disabled={pending} />
          <Button disabled={pending || reason.trim().length < 3} onClick={save}>{pending ? "Salvando…" : "Confirmar veredito"}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}