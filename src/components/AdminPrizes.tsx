import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
export const PRIZE_AMOUNTS = [100, 50, 30] as const;
type Event = Database["public"]["Tables"]["prize_events"]["Row"];
export function AdminPrizes() {
  const qc = useQueryClient();
  const [eventId, setEventId] = useState("");
  const [draft, setDraft] = useState<{ id: string | null; name: string; amounts: number[] } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState<number | null>(null);
  const events = useQuery({ queryKey: ["admin", "prizes", "events"], queryFn: async () => { const r = await supabase.from("prize_events").select("*").order("created_at", { ascending: false }); if (r.error) throw r.error; return r.data; }});
  const players = useQuery({ queryKey: ["admin", "prizes", "players"], queryFn: async () => { const r = await supabase.from("profiles").select("id,name,rating").eq("is_ghost", false).order("rating", { ascending: false }); if (r.error) throw r.error; return r.data; }});
  const history = useQuery({ queryKey: ["admin", "prizes", "history"], queryFn: async () => { const r = await supabase.from("prize_payouts").select("*").order("paid_at", { ascending: false }).limit(100); if (r.error) throw r.error; return r.data; }});
  const event = events.data?.find(e => e.id === eventId);
  const amounts = event ? [Number(event.first_amount), Number(event.second_amount), Number(event.third_amount)] : [...PRIZE_AMOUNTS];
  const recipient = (place: number) => recipients[place] ?? players.data?.[place - 1]?.id ?? "";
  async function saveEvent() {
    if (!draft || busy) return; setBusy(true);
    try {
      const r = await supabase.rpc("admin_save_prize_event", { p_id: draft.id ?? crypto.randomUUID(), p_name: draft.name, p_first: draft.amounts[0] ?? 0, p_second: draft.amounts[1] ?? 0, p_third: draft.amounts[2] ?? 0 });
      if (r.error) throw r.error; setEventId(r.data); setDraft(null); await qc.invalidateQueries({ queryKey: ["admin", "prizes"] }); toast.success("Evento salvo.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui salvar o evento."); } finally { setBusy(false); }
  }
  async function pay() {
    if (!event || confirm === null || busy) return; setBusy(true);
    try { const r = await supabase.rpc("mark_event_prize_paid", { p_event: event.id, p_user: recipient(confirm), p_place: confirm, p_note: note }); if (r.error) throw r.error; setConfirm(null); await qc.invalidateQueries({ queryKey: ["admin", "prizes"] }); toast.success("Pagamento registrado."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui registrar o pagamento."); } finally { setBusy(false); }
  }
  function editEvent(e?: Event) { setDraft({ id: e?.id ?? null, name: e?.name ?? "", amounts: e ? [Number(e.first_amount), Number(e.second_amount), Number(e.third_amount)] : [...PRIZE_AMOUNTS] }); }
  return <section className="mt-6 space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><h2 className="flex items-center gap-2 font-display text-2xl font-bold"><Trophy className="text-primary" />Prêmios</h2><Button onClick={() => editEvent()}><Plus size={16} />Novo evento</Button></div>
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Evento<select aria-label="Evento dos prêmios" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={eventId} onChange={e => { setEventId(e.target.value); setRecipients({}); }}><option value="">Selecione um evento</option>{events.data?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><Button variant="outline" disabled={!event} onClick={() => editEvent(event)}>Editar evento e valores</Button></div>
    {events.error && <p className="text-destructive">{events.error.message}</p>}
    {!event && <p className="text-sm text-muted-foreground">Nenhum evento selecionado.</p>}
    {event && <><Input aria-label="Observação do pagamento" placeholder="Observação do pagamento" value={note} onChange={e => setNote(e.target.value)} /><div className="grid gap-4 sm:grid-cols-3">{amounts.map((amount, index) => { const place = index + 1; const paid = history.data?.find(h => h.event_id === event.id && h.place === place); return <article key={place} className="rounded-md border border-border bg-card p-4"><p className="text-xs font-bold uppercase text-muted-foreground">{place}º lugar</p><p className="mt-3 font-display text-2xl font-bold text-primary">{amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p><label className="mt-4 block text-sm">Jogador<select aria-label={`Jogador do ${place}º prêmio`} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={paid?.user_id ?? recipient(place)} disabled={!!paid} onChange={e => setRecipients({ ...recipients, [place]: e.target.value })}>{players.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Button className="mt-4 w-full" disabled={busy || !!paid || !recipient(place)} onClick={() => setConfirm(place)}>{paid ? "Pago" : "Marcar como pago"}</Button></article>; })}</div></>}
    <section className="border-t border-border pt-5"><h3 className="font-display text-xl font-bold">Pagamentos registrados</h3><ul className="mt-3 divide-y divide-border">{history.data?.map(h => <li key={h.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span><b>{h.event_name ?? "Ranking geral"}</b> · {h.place}º · {players.data?.find(p => p.id === h.user_id)?.name ?? "—"}{h.note ? ` · ${h.note}` : ""}</span><span className="text-muted-foreground">{Number(h.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {new Date(h.paid_at).toLocaleDateString("pt-BR")}</span></li>)}</ul>{!history.data?.length && <p className="mt-3 text-sm text-muted-foreground">Nenhum pagamento ainda.</p>}</section>
    <Dialog open={!!draft} onOpenChange={open => { if (!open && !busy) setDraft(null); }}><DialogContent><DialogTitle>{draft?.id ? "Editar evento" : "Novo evento"}</DialogTitle><DialogDescription>Nome e valores dos três prêmios</DialogDescription>{draft && <><label className="text-sm">Evento<Input aria-label="Nome do evento" value={draft.name} maxLength={100} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>{draft.amounts.map((amount, i) => <label key={i} className="text-sm">{i + 1}º lugar · R$<Input aria-label={`Valor do ${i + 1}º prêmio`} type="number" min={0} max={1000000} step="0.01" value={amount} onChange={e => setDraft({ ...draft, amounts: draft.amounts.map((v, index) => index === i ? Number(e.target.value) : v) })} /></label>)}<Button disabled={busy || draft.name.trim().length < 2 || draft.amounts.some(v => !Number.isFinite(v) || v < 0 || v > 1000000)} onClick={saveEvent}><Save size={16} />Salvar evento</Button></>}</DialogContent></Dialog>
    <Dialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}><DialogContent><DialogTitle>Registrar pagamento?</DialogTitle><DialogDescription>{event?.name} · {confirm}º lugar · R$ {confirm ? amounts[confirm - 1] : 0}. O PIX deve ser realizado separadamente.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Cancelar</Button><Button disabled={busy} onClick={pay}>Confirmar pagamento</Button></div></DialogContent></Dialog>
  </section>;
}