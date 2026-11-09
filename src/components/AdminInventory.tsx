import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Gift, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { useFrameCatalog } from "./Avatar";
import type { AdminOverview } from "@/lib/inhouse.functions";

export function AdminInventory({ users }: { users: AdminOverview["users"] }) {
  const catalog = useFrameCatalog();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [price, setPrice] = useState(500);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState("");
  const [kind, setKind] = useState("frame");
  const [frame, setFrame] = useState("coroa-fogo");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const request = useRef<string | null>(null);
  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  async function upload() {
    if (!file || busy || name.trim().length < 2 || !Number.isInteger(price) || price < 0 || price > 100000) return;
    setBusy(true);
    let path: string | null = null;
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Entre novamente na sua conta.");
      const id = `custom-${crypto.randomUUID().replaceAll("-", "")}`;
      path = `${auth.user.id}/${id}.png`;
      const uploaded = await supabase.storage.from("frame-art").upload(path, file, { cacheControl: "31536000" });
      if (uploaded.error) throw uploaded.error;
      const { error } = await supabase.rpc("admin_publish_shop_frame", { p_id: id, p_name: name, p_path: path, p_price: price });
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["frame-catalog"] }), qc.invalidateQueries({ queryKey: ["shop"] })]);
      toast.success("Moldura adicionada à loja!"); setName(""); setFile(null);
      if (preview) URL.revokeObjectURL(preview); setPreview(null);
    } catch (e) {
      if (path) await supabase.storage.from("frame-art").remove([path]);
      toast.error(e instanceof Error ? e.message : "Não consegui publicar a moldura.");
    } finally { setBusy(false); }
  }

  async function grant() {
    if (busy || !user || reason.trim().length < 3) return;
    setBusy(true);
    request.current ??= crypto.randomUUID();
    try {
      const { error } = await supabase.rpc("admin_grant_inventory", { p_user: user, p_kind: kind, p_amount: kind === "frame" ? 1 : amount, p_frame: frame, p_reason: reason, p_request: request.current });
      if (error) throw error;
      request.current = null;
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin"] }), qc.invalidateQueries({ queryKey: ["avatar-frame-access"] }), qc.invalidateQueries({ queryKey: ["point-protection"] }), qc.invalidateQueries({ queryKey: ["coin-balance"] })]);
      toast.success("Item entregue ao jogador!"); setReason("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui entregar o item."); }
    finally { setBusy(false); }
  }

  async function removeFrame() {
    if (!removing || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_remove_uploaded_frame", { p_frame: removing.id });
      if (error) throw new Error(error.message);
      await Promise.all(["frame-catalog", "shop", "avatar-frames", "avatar-frame-access", "admin"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      setRemoving(null); toast.success("Moldura removida do site.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui remover a moldura."); }
    finally { setBusy(false); }
  }

  return <div className="mt-6 grid gap-8 md:grid-cols-2">
    <section className="min-w-0 border-t border-border pt-5">
      <h2 className="font-display text-xl font-bold">Adicionar moldura à loja</h2>
      <div className="mt-4 space-y-4">
        <label className="block text-sm">Nome<Input aria-label="Nome da moldura" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload /> Escolher PNG</Button>
        <input ref={fileRef} type="file" accept="image/png" aria-label="Arquivo da moldura" className="hidden" onChange={e => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          if (f.type !== "image/png" || f.size > 5 * 1024 * 1024) { toast.error("Escolha um PNG de até 5MB."); return; }
          if (preview) URL.revokeObjectURL(preview); setFile(f); setPreview(URL.createObjectURL(f));
        }} />
        {preview && <img src={preview} alt="Prévia da nova moldura" className="h-40 w-40 object-contain" />}
        <label className="block text-sm">Preço em moedas<Input aria-label="Preço da moldura em moedas" type="number" min={0} max={100000} value={price} onChange={e => setPrice(Number(e.target.value))} /></label>
        <Button onClick={upload} disabled={busy || !file || name.trim().length < 2 || !Number.isInteger(price) || price < 0 || price > 100000}><Upload /> Adicionar à loja</Button>
      </div>
    </section>
    <section className="min-w-0 border-t border-border pt-5">
      <h2 className="font-display text-xl font-bold">Entregar itens</h2>
      <div className="mt-4 space-y-4">
        <Input aria-label="Buscar destinatário" placeholder="Buscar jogador…" value={search} onChange={e => setSearch(e.target.value)} />
        <label className="block text-sm">Jogador<select aria-label="Jogador destinatário" className={selectClass} value={user} onChange={e => { setUser(e.target.value); request.current = null; }}><option value="">Selecione</option>{users.filter(u => !u.isGhost && u.name.toLowerCase().includes(search.toLowerCase())).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="block text-sm">Item<select aria-label="Tipo do item" className={selectClass} value={kind} onChange={e => { setKind(e.target.value); request.current = null; }}><option value="frame">Moldura</option><option value="coins">Moedas da loja</option><option value="protection">Protetores de ponto</option></select></label>
        {kind === "frame" ? <select aria-label="Moldura para entregar" className={selectClass} value={frame} onChange={e => { setFrame(e.target.value); request.current = null; }}>{catalog.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select> : <label className="block text-sm">Quantidade<Input aria-label="Quantidade de itens" type="number" min={1} max={100000} value={amount} onChange={e => { setAmount(Number(e.target.value)); request.current = null; }} /></label>}
        <label className="block text-sm">Motivo<Input aria-label="Motivo da entrega" value={reason} onChange={e => { setReason(e.target.value); request.current = null; }} /></label>
        <Button disabled={busy || !user || reason.trim().length < 3 || !Number.isInteger(amount) || amount < 1 || amount > 100000} onClick={grant}><Gift /> Entregar item</Button>
      </div>
    </section>
    <section className="min-w-0 border-t border-border pt-5 md:col-span-2">
      <h2 className="font-display text-xl font-bold">Molduras enviadas</h2>
      {catalog.filter(f => f.id.startsWith("custom-")).length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhuma moldura enviada.</p>}
      <ul className="mt-3 divide-y divide-border">{catalog.filter(f => f.id.startsWith("custom-")).map(f => <li key={f.id} className="flex items-center gap-3 py-3"><img src={f.image} alt="" className="h-14 w-14 object-contain" /><span className="min-w-0 flex-1 break-words font-semibold">{f.label}</span><Button size="icon" variant="destructive" disabled={busy} aria-label={`Apagar moldura ${f.label}`} title={`Apagar ${f.label}`} onClick={() => setRemoving(f)}><Trash2 size={16} /></Button></li>)}</ul>
    </section>
    <Dialog open={removing !== null} onOpenChange={open => { if (!open && !busy) setRemoving(null); }}><DialogContent><DialogHeader><DialogTitle>Apagar {removing?.label}?</DialogTitle><DialogDescription>A moldura sairá da loja, dos perfis e das opções de seleção. Compras e registros serão preservados, sem devolução automática de moedas.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={removeFrame}><Trash2 size={16} />{busy ? "Apagando…" : "Confirmar exclusão"}</Button></div></DialogContent></Dialog>
  </div>;
}