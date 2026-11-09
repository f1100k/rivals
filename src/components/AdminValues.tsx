import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFrameCatalog } from "./Avatar";
import { useNameFontCatalog } from "./NameFonts";
import { useNameColorCatalog } from "./NameColors";
import { AdminShopPrices } from "./AdminShopPrices";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Missing = { id: string; name: string; kind: string };
const KIND_LABEL: Record<string, string> = { frame: "Moldura", font: "Fonte", name_color: "Cor" };

/** Admin-only "Valores" tab: change any shop price and add catalog items that are not in the shop yet. */
export function AdminValues() {
  const qc = useQueryClient();
  const frames = useFrameCatalog();
  const fonts = useNameFontCatalog();
  const colors = useNameColorCatalog();
  const { data, error } = useQuery({ queryKey: ["admin-shop"], refetchInterval: 15000, queryFn: async () => {
    const r = await supabase.from("shop_items").select("*").order("sort");
    if (r.error) throw new Error(r.error.message);
    return r.data ?? [];
  } });
  const items = data ?? [];
  const missing = useMemo<Missing[]>(() => {
    const have = new Set(items.map(i => i.id));
    return [
      ...frames.map(f => ({ id: f.id, name: f.label, kind: "frame" })),
      ...(fonts.data ?? []).map(f => ({ id: f.id, name: f.name, kind: "font" })),
      ...(colors.data ?? []).map(c => ({ id: c.id, name: c.name, kind: "name_color" })),
    ].filter(m => !have.has(m.id));
  }, [items, frames, fonts.data, colors.data]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function add(m: Missing) {
    const price = Number(prices[m.id] ?? "");
    if (!Number.isInteger(price) || price < 0 || price > 100000) { toast.error("Digite um preço de 0 a 100000 moedas."); return; }
    setBusy(m.id);
    const sort = items.reduce((max, i) => Math.max(max, i.sort), 0) + 1;
    const { error } = await supabase.rpc("admin_save_shop_item", { p_id: m.id, p_name: m.name.slice(0, 60), p_price: price, p_active: true, p_sort: Math.min(sort, 100000) });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-shop"] }), qc.invalidateQueries({ queryKey: ["shop"] })]);
    toast.success(`${m.name} colocado na Loja por ${price} moedas.`);
  }

  if (error) return <p className="mt-6 text-destructive">{error.message}</p>;
  return <div className="mt-6">
    <p className="text-xs font-semibold uppercase text-primary">Só admins</p>
    <h2 className="font-display text-3xl font-bold">Valores</h2>
    <p className="mt-1 text-sm text-muted-foreground">Troque o preço de qualquer item da Loja ou coloque na Loja um item que ainda não está à venda.</p>

    <AdminShopPrices items={items} />

    <section className="mt-6 rounded-md border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2"><Plus className="size-5 text-primary" /><h3 className="font-display text-2xl font-bold">Adicionar à Loja</h3></div>
      <p className="mt-1 text-sm text-muted-foreground">Molduras, fontes e cores já criadas que ainda não estão à venda. Digite o preço e clique em adicionar.</p>
      <ul className="mt-4 divide-y divide-border">{missing.map(m => <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
        <span className="min-w-0 flex-1 break-words text-sm font-semibold">{m.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{KIND_LABEL[m.kind]}</span></span>
        <Input className="w-28" type="number" inputMode="numeric" min={0} max={100000} placeholder="Preço" aria-label={`Preço de ${m.name}`} value={prices[m.id] ?? ""} onChange={e => setPrices(p => ({ ...p, [m.id]: e.target.value }))} />
        <Button size="sm" disabled={busy !== null || !prices[m.id]} onClick={() => add(m)}><Plus size={16} />{busy === m.id ? "Adicionando…" : "Adicionar"}</Button>
      </li>)}</ul>
      {!missing.length && <p className="py-6 text-center text-sm text-muted-foreground">Tudo que foi criado já está na Loja.</p>}
    </section>
  </div>;
}
