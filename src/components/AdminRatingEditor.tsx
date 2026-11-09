import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export function AdminRatingEditor({ player, onClose }: { player: { id: string; name: string; rating: number }; onClose: () => void }) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef<string | null>(null);
  const qc = useQueryClient();
  const delta = mode === "add" ? amount : -amount;
  const valid = Number.isInteger(amount) && amount > 0 && amount <= 100000 && reason.trim().length >= 3;
  async function save() {
    if (!valid || pending) return;
    setPending(true);
    request.current ??= crypto.randomUUID();
    try {
      const { data, error } = await supabase.rpc("admin_adjust_rating", { p_user: player.id, p_delta: delta, p_reason: reason.trim(), p_request: request.current });
      if (error) throw new Error(error.message.includes("sem_permissao") ? "Apenas administradores podem ajustar pontos." : error.message);
      await Promise.all(["admin", "ranking", "my-profile", "inicio", "inhouse-gk", "player-profile"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      toast.success(`${player.name}: ${data} MMR. Ajuste registrado.`);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível ajustar os pontos."); }
    finally { setPending(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Ajustar pontos · {player.name}</DialogTitle><DialogDescription>Altera apenas o MMR. Vitórias, derrotas e resultados de partidas permanecem iguais.</DialogDescription></DialogHeader>
    <div className="grid grid-cols-2 gap-2" aria-label="Tipo de ajuste">
      <Button variant={mode === "add" ? "default" : "outline"} aria-pressed={mode === "add"} disabled={pending} onClick={() => { setMode("add"); request.current = null; }}><Plus size={16} />Adicionar</Button>
      <Button variant={mode === "remove" ? "destructive" : "outline"} aria-pressed={mode === "remove"} disabled={pending} onClick={() => { setMode("remove"); request.current = null; }}><Minus size={16} />Remover</Button>
    </div>
    <label className="grid gap-2 text-sm">Quantidade de pontos<Input aria-label="Quantidade de pontos" type="number" min={1} max={100000} value={amount} disabled={pending} onChange={e => { setAmount(Number(e.target.value)); request.current = null; }} /></label>
    <p className="text-sm font-semibold">{player.rating} → {Number.isInteger(amount) ? Math.max(0, player.rating + delta) : "—"} MMR</p>
    <label className="grid gap-2 text-sm">Motivo<Input aria-label="Motivo do ajuste" maxLength={500} value={reason} disabled={pending} onChange={e => { setReason(e.target.value); request.current = null; }} /></label>
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button><Button disabled={!valid || pending} onClick={save}>{pending ? <Loader2 size={16} className="animate-spin" /> : mode === "add" ? <Plus size={16} /> : <Minus size={16} />}Confirmar ajuste</Button></div>
  </DialogContent></Dialog>;
}