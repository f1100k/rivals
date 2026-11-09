import { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserMinus, Clock3, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import type { MatchKick } from "@/lib/match-kick";
import { EquippedProfileTag } from "./ProfileTags";

export const MatchKickContext = createContext<string | null>(null);

/** Admin-only decision on an expulsion the players already approved by majority. */
export async function decideKick(voteId: string, approve: boolean) {
  // The database checks the admin role.
  const { error } = await supabase.rpc("admin_decide_match_kick_gk", { p_vote: voteId, p_approve: approve });
  if (error) throw new Error(error.message);
}

export function KickPlayerButton({ userId, isMe }: { userId: string; isMe: boolean }) {
  const matchId = useContext(MatchKickContext);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!matchId || isMe) return null;
  async function start() {
    if (!matchId || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("start_match_kick_gk", { p_match: matchId, p_target: userId });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["inhouse-gk"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui iniciar a votação."); }
    finally { setBusy(false); }
  }
  return <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={start} aria-label="Votar para Expulsar" title="Votar para Expulsar"><UserMinus size={14} /><span className="hidden sm:inline">Votar para Expulsar</span></Button>;
}

export function ActiveKickVote({ vote, myId }: { vote: MatchKick; myId?: string | undefined }) {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const pendingAdmin = vote.status === "pending_admin";
  const left = Math.max(0, Math.ceil((Date.parse(vote.endsAt) - now) / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => { if (left === 0 && !pendingAdmin) void qc.invalidateQueries({ queryKey: ["inhouse-gk"] }); }, [left, pendingAdmin, qc]);
  useEffect(() => {
    if (!pendingAdmin) return;
    supabase.from("user_roles").select("role").then(({ data }) => setIsAdmin(!!data?.some(r => r.role === "admin")));
  }, [pendingAdmin]);

  async function cast(yes: boolean) {
    if (busy || !left) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("cast_match_kick_gk", { p_vote: vote.id, p_yes: yes });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["inhouse-gk"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui votar."); }
    finally { setBusy(false); }
  }
  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await decideKick(vote.id, approve);
      toast.success(approve ? `${vote.targetName} foi removido da partida.` : `${vote.targetName} continua na partida.`);
      await qc.invalidateQueries({ queryKey: ["inhouse-gk"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui registrar a decisão."); }
    finally { setBusy(false); }
  }

  if (pendingAdmin) {
    return <section role="status" className="mt-5 border-y-2 border-primary/50 bg-primary/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Expulsar {vote.targetName}? <EquippedProfileTag userId={vote.targetId} /></h2>
        <strong className="flex items-center gap-2 text-primary"><ShieldCheck size={18} />Aguardando admin</strong>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">A maioria votou para expulsar ({vote.yes} sim · {vote.no} não). O jogador só sai depois que um admin confirmar. A partida fica pausada até lá.</p>
      {isAdmin && <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="destructive" disabled={busy} onClick={() => decide(true)}>Aprovar expulsão</Button>
        <Button variant="outline" disabled={busy} onClick={() => decide(false)}>Manter jogador</Button>
      </div>}
    </section>;
  }

  return <section role="status" className="mt-5 border-y-2 border-destructive/50 bg-destructive/10 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-bold">Expulsar {vote.targetName}? <EquippedProfileTag userId={vote.targetId} /></h2><strong className="flex items-center gap-2"><Clock3 size={18} />{left ? `${left}s` : "Apurando…"}</strong></div>
    <p className="mt-2 text-sm text-muted-foreground">{vote.yes} sim · {vote.no} não · se a maioria aprovar, um admin ainda precisa confirmar.</p>
    {myId === vote.targetId ? <p className="mt-3 text-sm">Você é o alvo e não participa desta votação.</p> : <div className="mt-4 flex flex-wrap gap-3">
      <Button variant={vote.myVote === true ? "default" : "destructive"} disabled={busy || !left} onClick={() => cast(true)}>Expulsar (Sim){vote.myVote === true ? " ✓" : ""}</Button>
      <Button variant={vote.myVote === false ? "default" : "outline"} disabled={busy || !left} onClick={() => cast(false)}>Manter (Não){vote.myVote === false ? " ✓" : ""}</Button>
    </div>}
  </section>;
}
