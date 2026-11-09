import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag } from "lucide-react";
import { EquippedProfileTag } from "./ProfileTags";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getMyReportMatches, submitPlayerReport } from "@/lib/player-reports.functions";

export function PlayerReports() {
  const fetchFn = useServerFn(getMyReportMatches);
  const submitFn = useServerFn(submitPlayerReport);
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["my-report-matches"], queryFn: () => fetchFn(), refetchInterval: 10000, refetchIntervalInBackground: false });
  const [target, setTarget] = useState<{ matchId: string; targetId: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  async function send() {
    if (!target || pending) return;
    setPending(true);
    try {
      await submitFn({ data: { ...target, reason } });
      await qc.invalidateQueries({ queryKey: ["my-report-matches"] });
      setTarget(null);
      setReason("");
      toast.success("Denúncia enviada.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível enviar."); }
    finally { setPending(false); }
  }
  const ban = data?.sanction?.bannedUntil;
  const banned = ban === "permanent" || (ban && new Date(ban) > new Date());
  return (
    <section className="mt-8 border-t border-border py-6">
      {banned && <p role="alert" className="mb-4 text-destructive">{ban === "permanent" ? "Você recebeu um ban permanente por denúncias." : `Você está suspenso até ${new Date(ban ?? "").toLocaleString("pt-BR")}.`} <span className="text-muted-foreground">Punição {data?.sanction?.strikes}.</span></p>}
      <h2 className="text-xl font-bold">Denúncias · pós-partida</h2>
      {error && <p className="mt-3 text-destructive">Não foi possível carregar as denúncias.</p>}
      {data?.matches.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhuma partida concluída.</p>}
      {data?.matches.map((m) => (
        <details key={m.id} className="mt-4 border-b border-border pb-4">
          <summary className="cursor-pointer text-sm font-semibold">Partida #{m.id.slice(0, 8)} · {new Date(m.completedAt).toLocaleString("pt-BR")}</summary>
          <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
            {m.players.filter((p) => !p.isMe).map((p) => (
              <li key={p.userId} className="flex min-w-0 items-center justify-between gap-2 border-b border-border py-2">
                <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm"><span className="truncate">{p.name}</span><EquippedProfileTag userId={p.userId} /></span>
                <Button variant="ghost" size="sm" disabled={p.reported} aria-label={`Denunciar ${p.name}`} onClick={() => { setReason(""); setTarget({ matchId: m.id, targetId: p.userId, name: p.name }); }}>
                  <Flag size={14} /> {p.reported ? "Enviada" : "Denunciar"}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ))}
      <Dialog open={!!target} onOpenChange={(open) => { if (!open && !pending) setTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader><DialogTitle>Denunciar {target?.name}</DialogTitle><DialogDescription>Descreva sabotagem, entrega, abandono intencional ou comportamento antijogo. Erros e falta de habilidade não são trollagem. Seu nome será visível apenas ao administrador. Sete concordâncias precisam de validação antes de punir.</DialogDescription></DialogHeader>
          <label htmlFor="report-reason" className="text-sm font-semibold">Motivo</label>
          <Textarea id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="O que aconteceu na partida?" disabled={pending} />
          <Button disabled={pending || reason.trim().length < 20} onClick={send}>{pending ? "Enviando…" : "Enviar denúncia"}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}