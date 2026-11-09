import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Minus, Palette, Pencil, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AdminOverview } from "@/lib/inhouse.functions";
import { NAME_COLOR_PRESETS, NAME_COLOR_STYLES, STYLE_INFO, isHex, nameColorStyle, newColorId, type NameColorDef, type NameColorStyle } from "@/lib/name-colors";
import { EQUIPPED_COLORS_KEY, NAME_COLORS_KEY, useNameColorCatalog, type NameColorRow } from "./NameColors";
import { ShopCoin } from "./ShopItemVisual";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** Name in a color style, with room for glows and shadows. */
function Painted({ def, children, className = "" }: { def: NameColorDef; children: string; className?: string }) {
  return <span className={`inline-block max-w-full px-1 font-bold ${className}`} style={nameColorStyle(def)}>{children}</span>;
}

/** Staff (admins and moderators) create name colors/effects and turn each one into a shop product. */
export function AdminNameColors({ users }: { users: AdminOverview["users"] }) {
  const qc = useQueryClient();
  const { data: colors, error } = useNameColorCatalog();
  const { data: items } = useQuery({
    queryKey: ["admin-color-items"],
    queryFn: async () => {
      const r = await supabase.from("shop_items").select("id,price,active").eq("kind", "name_color");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [style, setStyle] = useState<NameColorStyle>("solid");
  const [color1, setColor1] = useState("#9d4dff");
  const [color2, setColor2] = useState("#00e5ff");
  const [sample, setSample] = useState("Jogador");
  const [price, setPrice] = useState(0);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [giftColor, setGiftColor] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const usesSecond = !!STYLE_INFO[style].second;
  const def: NameColorDef = { style, color1, color2: usesSecond ? color2 : null };
  const text = sample.trim() || "Jogador";

  function reset() {
    setId(null); setName(""); setStyle("solid"); setColor1("#9d4dff"); setColor2("#00e5ff"); setPrice(0); setActive(false);
  }

  function applyPreset(p: (typeof NAME_COLOR_PRESETS)[number]) {
    setId(null); setName(p.name); setStyle(p.style); setColor1(p.color1); if (p.color2) setColor2(p.color2);
    setPrice(0); setActive(false);
  }

  function select(c: NameColorRow) {
    const item = items?.find((i) => i.id === c.id);
    setId(c.id); setName(c.name); setStyle((NAME_COLOR_STYLES as readonly string[]).includes(c.style) ? (c.style as NameColorStyle) : "solid");
    setColor1(c.color1); if (c.color2) setColor2(c.color2);
    setPrice(item?.price ?? 0); setActive(item?.active ?? false);
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: NAME_COLORS_KEY }),
      qc.invalidateQueries({ queryKey: ["admin-color-items"] }),
      qc.invalidateQueries({ queryKey: ["admin-shop"] }),
      qc.invalidateQueries({ queryKey: ["shop"] }),
      qc.invalidateQueries({ queryKey: EQUIPPED_COLORS_KEY }),
      qc.invalidateQueries({ queryKey: ["player-name-colors"] }),
    ]);
  }

  const validPrice = Number.isInteger(price) && price >= 0 && price <= 100000;
  const canSave = !busy && name.trim().length >= 2 && isHex(color1) && (!usesSecond || isHex(color2)) && validPrice;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    const colorId = id ?? newColorId();
    try {
      const r = await supabase.rpc("staff_save_name_color", { p_id: colorId, p_name: name.trim(), p_style: style, p_color1: color1, p_color2: usesSecond ? color2 : "", p_price: price, p_active: active });
      if (r.error) throw r.error;
      setId(colorId);
      await refresh();
      toast.success(active ? "Cor salva e colocada na loja." : "Cor salva (fora da loja).");
    } catch { toast.error("Não consegui salvar a cor."); } finally { setBusy(false); }
  }

  async function addAllPresets() {
    const have = new Set((colors ?? []).map((c) => c.name.toLowerCase()));
    const missing = NAME_COLOR_PRESETS.filter((p) => !have.has(p.name.toLowerCase()));
    if (busy || !missing.length) { if (!missing.length) toast.info("Todos os modelos já foram criados."); return; }
    if (!window.confirm(`Criar ${missing.length} cores prontas, todas fora da loja e com preço 0? Depois é só editar o preço e marcar "Colocar na loja" em cada uma.`)) return;
    setBusy(true);
    let made = 0;
    try {
      for (const p of missing) {
        const r = await supabase.rpc("staff_save_name_color", { p_id: newColorId(), p_name: p.name, p_style: p.style, p_color1: p.color1, p_color2: p.color2 ?? "", p_price: 0, p_active: false });
        if (r.error) throw r.error;
        made += 1;
      }
      toast.success(`${made} cores criadas (fora da loja).`);
    } catch { toast.error(`Parei depois de criar ${made} cores.`); } finally { await refresh(); setBusy(false); }
  }

  async function remove(c: { id: string; name: string }) {
    if (busy || !window.confirm(`Apagar a cor "${c.name}"? Ela sai da loja e some do nome de quem comprou (sem devolver moedas).`)) return;
    setBusy(true);
    try {
      const r = await supabase.rpc("staff_delete_name_color", { p_id: c.id });
      if (r.error) throw r.error;
      if (id === c.id) reset();
      await refresh();
      toast.success("Cor apagada.");
    } catch { toast.error("Não consegui apagar a cor."); } finally { setBusy(false); }
  }

  async function gift(removeIt: boolean) {
    if (!giftColor || !selected.length || busy) return;
    setBusy(true);
    try {
      const r = await supabase.rpc("staff_grant_name_color", { p_color: giftColor, p_users: selected, p_remove: removeIt });
      if (r.error) throw r.error;
      await refresh();
      const n = r.data ?? 0;
      if (removeIt) toast.success(n ? `Cor retirada de ${n} jogador(es).` : "Ninguém selecionado tinha ganhado essa cor (cores compradas não são retiradas).");
      else toast.success(n ? `Cor entregue para ${n} jogador(es).` : "Os jogadores selecionados já tinham essa cor.");
      if (n) setSelected([]);
    } catch { toast.error("Não consegui alterar as cores dos jogadores."); } finally { setBusy(false); }
  }

  const giftDef = colors?.find((c) => c.id === giftColor);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Cores do nome</h2>
          <p className="text-sm text-muted-foreground">Crie uma cor ou efeito, dê um nome e um preço. Ela vira um produto da Loja; quem comprar (ou ganhar de você) usa no nome, junto com a fonte.</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={reset}><Plus size={16} />Nova cor</Button>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Sparkles size={18} className="text-primary" />Modelos prontos</h3>
            <p className="text-xs text-muted-foreground">Clique num modelo para preencher o formulário, ou crie todos de uma vez (ficam fora da loja até você colocar).</p>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={addAllPresets}>Criar todos os modelos</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {NAME_COLOR_PRESETS.map((p) => (
            <button key={p.name} type="button" disabled={busy} onClick={() => applyPreset(p)} aria-label={`Usar modelo ${p.name}`} className="flex flex-col items-center gap-1 rounded-md border border-border bg-card px-2 py-3 text-center hover:border-primary">
              <Painted def={p} className="text-lg">{text}</Painted>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4 border-t border-border pt-5">
          <label className="block text-sm">Nome do produto<Input aria-label="Nome da cor" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
          <div>
            <p className="text-sm">Estilo</p>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Estilo da cor">
              {NAME_COLOR_STYLES.map((s) => (
                <Button key={s} type="button" size="sm" variant={style === s ? "default" : "outline"} role="radio" aria-checked={style === s} onClick={() => setStyle(s)}>{STYLE_INFO[s].label}</Button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{STYLE_INFO[style].hint}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">{usesSecond ? "Cor principal" : "Cor"}
              <span className="mt-1 flex items-center gap-2"><input type="color" aria-label="Cor principal" value={color1} onChange={(e) => setColor1(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-input bg-background" /><Input aria-label="Código da cor principal" value={color1} maxLength={7} onChange={(e) => setColor1(e.target.value.toLowerCase())} /></span>
            </label>
            {usesSecond && (
              <label className="block text-sm">{STYLE_INFO[style].second}
                <span className="mt-1 flex items-center gap-2"><input type="color" aria-label="Segunda cor" value={color2} onChange={(e) => setColor2(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-input bg-background" /><Input aria-label="Código da segunda cor" value={color2} maxLength={7} onChange={(e) => setColor2(e.target.value.toLowerCase())} /></span>
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Preço em moedas<Input aria-label="Preço da cor" type="number" min={0} max={100000} value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="Colocar na loja" />Colocar na loja</label>
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <label className="block text-xs text-muted-foreground">Texto da prévia<Input aria-label="Texto da prévia" value={sample} maxLength={30} onChange={(e) => setSample(e.target.value)} /></label>
            {isHex(color1) ? (
              <>
                <Painted def={def} className="break-words py-1 text-4xl">{text}</Painted>
                <p className="text-sm">No ranking: <Painted def={def}>{text}</Painted></p>
              </>
            ) : <p className="text-sm text-destructive">Use um código de cor como #9d4dff.</p>}
          </div>
          <Button disabled={!canSave} onClick={save}><Save size={16} />{busy ? "Salvando…" : id ? "Salvar alterações" : "Salvar cor"}</Button>
        </div>
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-xl font-bold">Cores criadas</h3>
          {error && <p role="alert" className="mt-2 text-destructive">Não consegui carregar as cores.</p>}
          {!colors?.length && <p className="mt-3 text-sm text-muted-foreground">Nenhuma cor ainda.</p>}
          <ul className="mt-2 max-h-[34rem] divide-y divide-border overflow-y-auto">
            {colors?.map((c) => {
              const item = items?.find((i) => i.id === c.id);
              return (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Painted def={c} className="text-xl">{c.name}</Painted>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><ShopCoin className="h-3 w-3" />{item?.price ?? 0} · {item?.active ? "na loja" : "fora da loja"} · {STYLE_INFO[c.style as NameColorStyle]?.label ?? c.style}</span>
                  </div>
                  <Button size="icon" variant={id === c.id ? "default" : "ghost"} aria-label={`Editar cor ${c.name}`} title="Editar cor" disabled={busy} onClick={() => select(c)}><Pencil size={16} /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Apagar cor ${c.name}`} title="Apagar cor" disabled={busy} onClick={() => remove(c)}><Trash2 size={16} /></Button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-8 space-y-4 border-t border-border pt-5">
        <div>
          <h3 className="flex items-center gap-2 font-display text-xl font-bold"><Palette size={18} />Entregar cor</h3>
          <p className="text-sm text-muted-foreground">Dê uma cor de presente para quem você quiser. O jogador recebe um aviso e escolhe em Perfil → Cor do nome, junto com as que já tem.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm">Cor
              <select aria-label="Cor para entregar" value={giftColor} onChange={(e) => setGiftColor(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Escolha uma cor…</option>
                {colors?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {giftDef && <Painted def={giftDef} className="break-words text-3xl">{text}</Painted>}
            <p className="text-sm text-muted-foreground">{selected.length} jogador(es) selecionado(s)</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!giftColor || !selected.length || busy} onClick={() => gift(false)}><Gift size={16} />Entregar cor</Button>
              <Button variant="outline" disabled={!giftColor || !selected.length || busy} onClick={() => gift(true)}><Minus size={16} />Retirar cor</Button>
            </div>
            <p className="text-xs text-muted-foreground">"Retirar" só tira cores dadas de presente; quem comprou na loja continua com a sua.</p>
          </div>
          <div className="space-y-2">
            <Input aria-label="Buscar jogador para cor" placeholder="Buscar jogador…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-72 divide-y divide-border overflow-y-auto">
              {users.filter((u) => !u.isGhost && u.name.toLowerCase().includes(search.toLowerCase())).map((u) => (
                <label key={u.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <input type="checkbox" checked={selected.includes(u.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, u.id] : selected.filter((v) => v !== u.id))} />
                  {u.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
