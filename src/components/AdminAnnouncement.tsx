import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendAnnouncement } from "@/lib/announcements.functions";

export function AdminAnnouncement() {
  const send = useServerFn(sendAnnouncement);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy || !msg.trim()) return;
    if (!confirm("Enviar este aviso para todos no site e no Discord?")) return;
    setBusy(true);
    try {
      const r = await send({ data: { message: msg } });
      setMsg("");
      if (r.discord) toast.success("Aviso enviado no site e no Discord.");
      else toast.warning("Aviso publicado no site, mas o Discord falhou.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setBusy(false); }
  }
  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-lg font-bold">Aviso geral</h3>
      <p className="text-sm text-muted-foreground">Aparece como janela na tela de todos os jogadores e é postado no canal #avisos do Discord.</p>
      <Textarea className="mt-3 min-h-32" maxLength={1500} placeholder="Escreva o aviso…" value={msg} onChange={(e) => setMsg(e.target.value)} />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{msg.length}/1500</span>
        <Button onClick={submit} disabled={busy || !msg.trim()}>{busy ? "Enviando…" : "Enviar aviso"}</Button>
      </div>
    </section>
  );
}
