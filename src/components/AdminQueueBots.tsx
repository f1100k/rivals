import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { addQueueBots } from "@/lib/admin-controls.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AdminQueueBots() {
  const [count, setCount] = useState(1);
  const [position, setPosition] = useState<"Goleiro" | "Pivô" | "Ala" | "Fixo">("Ala");
  const [pending, setPending] = useState(false);
  const [test, setTest] = useState(true);
  const add = useServerFn(addQueueBots);
  const qc = useQueryClient();
  async function submit() {
    if (pending) return;
    setPending(true);
    try {
      const result = await add({ data: { count, position, test } });
      toast.success(`${result.added} bots adicionados à ${test ? "fila de teste" : "fila oficial"}.`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin"] }), qc.invalidateQueries({ queryKey: ["queue"] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível adicionar bots."); }
    finally { setPending(false); }
  }
  return <section className="mt-4 flex flex-wrap items-end gap-3 border-y border-border py-5">
    <div className="mr-auto"><h2 className="flex items-center gap-2 font-semibold"><Bot className="size-5 text-primary" />Bots de teste</h2></div>
    <label className="grid gap-1 text-xs text-muted-foreground">Quantidade<Input aria-label="Quantidade de bots" type="number" min={1} max={8} value={count} onChange={e => setCount(Number(e.target.value))} className="w-24" disabled={pending} /></label>
    <div className="grid gap-1"><span className="text-xs text-muted-foreground">Posição na fila</span><Select value={position} onValueChange={v => { if (v === "Goleiro" || v === "Ala" || v === "Pivô" || v === "Fixo") setPosition(v); }} disabled={pending}><SelectTrigger aria-label="Posição dos bots" className="w-36"><SelectValue /></SelectTrigger><SelectContent>{["Goleiro", "Pivô", "Ala", "Fixo"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={test} onChange={e => setTest(e.target.checked)} disabled={pending} />Fila de teste</label>
    <Button onClick={submit} disabled={pending || !Number.isInteger(count) || count < 1 || count > 8}><Bot className="size-4" />{pending ? "Adicionando…" : "Adicionar bots"}</Button>
  </section>;
}