import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Save, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFrameCatalog } from "./Avatar";
import { ShopCoin, ShopFramePreview } from "./ShopItemVisual";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { visibleShopItems } from "@/lib/shop-display";
import { FontSample } from "./NameFonts";
import { useNameColorCatalog } from "./NameColors";
import { nameColorStyle } from "@/lib/name-colors";
import type { Database } from "@/integrations/supabase/types";
type Item = Database["public"]["Tables"]["shop_items"]["Row"];

export function AdminShopEditor() {
  const qc = useQueryClient();
  const catalog = useFrameCatalog();
  const colorCatalog = useNameColorCatalog();
  const [edit, setEdit] = useState<Item | null>(null);
  const [limitDraft, setLimitDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error } = useQuery({ queryKey: ["admin-shop"], refetchInterval: 15000, queryFn: async () => {
    const [items, settings] = await Promise.all([supabase.from("shop_items").select("*").order("sort"), supabase.from("shop_settings").select("display_limit").maybeSingle()]);
    if (items.error || settings.error) throw new Error(items.error?.message ?? settings.error?.message);
    return { items: items.data ?? [], limit: settings.data?.display_limit ?? 100 };
  }});
  const limit = limitDraft ?? data?.limit ?? 100;
  const visible = visibleShopItems(data?.items ?? [], data?.limit ?? 100);
  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    if (busy) return;
    setBusy(true);
    try { const result = await action(); if (result.error) throw new Error(result.error.message); await Promise.all([qc.invalidateQueries({ queryKey: ["admin-shop"] }), qc.invalidateQueries({ queryKey: ["shop"] })]); toast.success("Loja atualizada."); setEdit(null); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui salvar."); }
    finally { setBusy(false); }
  }
  function save(item: Item) { return run(() => supabase.rpc("admin_save_shop_item", { p_id: item.id, p_name: item.name, p_price: item.price, p_active: item.active, p_sort: item.sort })); }
  const valid = !!edit && edit.name.trim().length >= 2 && Number.isInteger(edit.price) && edit.price >= 0 && edit.price <= 100000 && Number.isInteger(edit.sort) && edit.sort >= 0 && edit.sort <= 100000;
  if (error) return <p className="mt-6 text-destructive">{error.message}</p>;
  return <section className="mt-6">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div><p className="text-xs font-semibold uppercase text-primary">Só admins</p><h2 className="font-display text-3xl font-bold">Loja</h2><p className="mt-1 text-sm text-muted-foreground">{visible.length} itens em exibição · {data?.items.filter(i => i.active).length ?? 0} ativos</p></div><div className="flex items-end gap-2"><label className="text-sm">Máximo de itens<Input className="mt-1 w-28" aria-label="Máximo de itens na loja" type="number" min={0} max={1000} value={limit} onChange={e => setLimitDraft(Number(e.target.value))} /></label><Button aria-label="Salvar quantidade" title="Salvar quantidade" disabled={busy || !Number.isInteger(limit) || limit < 0 || limit > 1000} onClick={() => run(() => supabase.rpc("admin_set_shop_limit", { p_limit: limit }))}><Save size={16} /></Button></div></div>
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{visible.map(item => <article key={item.id} className="flex min-w-0 flex-col items-center gap-3 rounded-md border border-border bg-card p-4"><div className="grid h-32 w-full place-items-center">{item.kind === "font" ? <FontSample fontId={item.id} className="line-clamp-2 break-words text-center text-3xl leading-tight">{item.name}</FontSample> : item.kind === "name_color" ? <span className="inline-block max-w-full break-words px-1 text-center text-3xl font-bold leading-tight" style={nameColorStyle(colorCatalog.data?.find(c => c.id === item.id))}>{item.name}</span> : <ShopFramePreview frame={catalog.find(f => f.id === item.id)} />}</div><p className="break-words text-center text-sm font-semibold">{item.name}</p><p className="flex items-center gap-1 font-display font-bold"><ShopCoin />{item.price}</p><Button variant="outline" className="mt-auto w-full" onClick={() => setEdit(item)}>Editar item</Button></article>)}</div>
    {!visible.length && <p className="py-10 text-center text-muted-foreground">Nenhum item em exibição.</p>}
    <h3 className="mt-8 border-t border-border pt-5 font-display text-xl font-bold">Catálogo completo</h3>
    <ul className="mt-3 divide-y divide-border">{data?.items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 py-3"><span className="min-w-0 flex-1 break-words text-sm">{item.name}<span className="ml-2 text-muted-foreground">{item.price} moedas · ordem {item.sort}</span></span><Button size="icon" variant="ghost" title="Subir ordem" aria-label={`Subir ${item.name}`} disabled={busy || item.sort === 0} onClick={() => save({ ...item, sort: Math.max(0, item.sort - 1) })}><ArrowUp size={16} /></Button><Button size="icon" variant="ghost" title="Descer ordem" aria-label={`Descer ${item.name}`} disabled={busy} onClick={() => save({ ...item, sort: item.sort + 1 })}><ArrowDown size={16} /></Button><Button size="sm" variant="outline" onClick={() => setEdit(item)}>Editar</Button><Button size="sm" variant={item.active ? "ghost" : "outline"} disabled={busy} onClick={() => save({ ...item, active: !item.active })}>{item.active ? <EyeOff size={16} /> : <Eye size={16} />}{item.active ? "Remover da loja" : "Colocar na loja"}</Button></li>)}</ul>
    {catalog.filter(f => !data?.items.some(i => i.id === f.id)).map(frame => <Button key={frame.id} variant="outline" className="mt-3 mr-2" onClick={() => setEdit({ id: frame.id, name: frame.label, kind: "frame", price: 500, active: true, sort: (data?.items.length ?? 0) + 1 })}><Plus size={16} />{frame.label}</Button>)}
    <Dialog open={!!edit} onOpenChange={open => { if (!open && !busy) setEdit(null); }}><DialogContent><DialogTitle>Editar item</DialogTitle><DialogDescription>{edit?.id}</DialogDescription>{edit && <><label className="text-sm">Nome<Input aria-label="Nome do item" maxLength={60} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></label><label className="text-sm">Preço em moedas<Input aria-label="Preço do item" type="number" min={0} max={100000} value={edit.price} onChange={e => setEdit({ ...edit, price: Number(e.target.value) })} /></label><label className="text-sm">Ordem<Input aria-label="Ordem do item" type="number" min={0} max={100000} value={edit.sort} onChange={e => setEdit({ ...edit, sort: Number(e.target.value) })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} />Visível na loja</label><Button disabled={busy || !valid} onClick={() => save(edit)}><Save size={16} />{busy ? "Salvando…" : "Salvar item"}</Button></>}</DialogContent></Dialog>
  </section>;
}