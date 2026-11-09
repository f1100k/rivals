import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ShopCoin } from "./ShopItemVisual";
import type { Database } from "@/integrations/supabase/types";
type Item = Database["public"]["Tables"]["shop_items"]["Row"];

const GROUPS = [
  { kind: "frame", label: "Molduras" },
  { kind: "font", label: "Fontes" },
  { kind: "name_color", label: "Cores" },
] as const;

const MAX_PRICE = 100000;
const validPrice = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_PRICE;

/** Quick price editor: change one item's price inline or set every item of a type at once. */
export function AdminShopPrices({ items }: { items: Item[] }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<(typeof GROUPS)[number]["kind"]>("frame");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => items.filter(i => i.kind === kind).sort((a, b) => Number(b.active) - Number(a.active) || a.sort - b.sort), [items, kind]);

  async function savePrices(changes: { item: Item; price: number }[]) {
    if (busy || !changes.length) return;
    setBusy(true);
    try {
      for (const { item, price } of changes) {
        const { error } = await supabase.rpc("admin_save_shop_item", { p_id: item.id, p_name: item.name, p_price: price, p_active: item.active, p_sort: item.sort });
        if (error) throw new Error(`${item.name}: ${error.message}`);
      }
      setDrafts(d => { const next = { ...d }; changes.forEach(c => delete next[c.item.id]); return next; });
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-shop"] }), qc.invalidateQueries({ queryKey: ["shop"] })]);
      toast.success(changes.length === 1 ? `Preço de ${changes[0]!.item.name} atualizado.` : `${changes.length} preços atualizados.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar o preço.");
      await qc.invalidateQueries({ queryKey: ["admin-shop"] });
    } finally { setBusy(false); }
  }

  const pending = list.flatMap(item => {
    const raw = drafts[item.id];
    if (raw === undefined || raw === "") return [];
    const price = Number(raw);
    return validPrice(price) && price !== item.price ? [{ item, price }] : [];
  });
  const bulkPrice = Number(bulk);
  const groupLabel = GROUPS.find(g => g.kind === kind)!.label.toLowerCase();

  return <section className="mt-6 rounded-md border border-border bg-card p-4 sm:p-5">
    <div className="flex items-center gap-2"><Tag className="size-5 text-primary" /><h2 className="font-display text-2xl font-bold">Trocar preços</h2></div>
    <p className="mt-1 text-sm text-muted-foreground">Digite o novo valor em moedas e clique em salvar. Quem já comprou continua com o item.</p>
    <div className="mt-4 flex flex-wrap gap-2">{GROUPS.map(g => <Button key={g.kind} size="sm" variant={kind === g.kind ? "default" : "outline"} onClick={() => { setKind(g.kind); setBulk(""); }}>{g.label} ({items.filter(i => i.kind === g.kind).length})</Button>)}</div>

    {list.length > 0 && <div className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
      <label className="text-sm">Mesmo preço para todas as {groupLabel}<Input className="mt-1 w-36" type="number" inputMode="numeric" min={0} max={MAX_PRICE} placeholder="Ex.: 200" aria-label={`Preço para todas as ${groupLabel}`} value={bulk} onChange={e => setBulk(e.target.value)} /></label>
      <Button variant="outline" disabled={busy || bulk === "" || !validPrice(bulkPrice)} onClick={() => { if (window.confirm(`Colocar ${bulkPrice} moedas em todas as ${list.length} ${groupLabel}?`)) void savePrices(list.filter(i => i.price !== bulkPrice).map(item => ({ item, price: bulkPrice }))).then(() => setBulk("")); }}>Aplicar em todas</Button>
    </div>}

    <ul className="mt-4 divide-y divide-border">{list.map(item => {
      const raw = drafts[item.id] ?? String(item.price);
      const price = Number(raw);
      const changed = raw !== "" && price !== item.price;
      const ok = raw !== "" && validPrice(price);
      return <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
        <span className="min-w-0 flex-1 break-words text-sm font-semibold">{item.name}{!item.active && <span className="ml-2 text-xs font-normal text-muted-foreground">fora da loja</span>}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">Agora: <ShopCoin />{item.price}</span>
        <Input className="w-28" type="number" inputMode="numeric" min={0} max={MAX_PRICE} aria-label={`Novo preço de ${item.name}`} value={raw} onChange={e => setDrafts(d => ({ ...d, [item.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter" && changed && ok) void savePrices([{ item, price }]); }} />
        <Button size="sm" disabled={busy || !changed || !ok} onClick={() => savePrices([{ item, price }])}><Save size={16} />Salvar</Button>
      </li>;
    })}</ul>
    {!list.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item desse tipo ainda.</p>}
    {pending.length > 1 && <Button className="mt-3" disabled={busy} onClick={() => savePrices(pending)}><Save size={16} />Salvar {pending.length} preços alterados</Button>}
  </section>;
}
