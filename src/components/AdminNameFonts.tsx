import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileType, Gift, Minus, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AdminOverview } from "@/lib/inhouse.functions";
import { FONT_ACCEPT, FONT_BUCKET, FONT_MAX_BYTES, fontFormat, newFontId } from "@/lib/name-fonts";
import { EQUIPPED_FONTS_KEY, FontSample, NAME_FONTS_KEY, useNameFontCatalog } from "./NameFonts";
import { ShopCoin } from "./ShopItemVisual";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

let previewCounter = 0;

/** Staff (admins and moderators) import fonts and turn each one into a shop product. */
export function AdminNameFonts({ users }: { users: AdminOverview["users"] }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: fonts, error } = useNameFontCatalog();
  const { data: items } = useQuery({
    queryKey: ["admin-font-items"],
    queryFn: async () => {
      const r = await supabase.from("shop_items").select("id,price,active").eq("kind", "font");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewFamily, setPreviewFamily] = useState<string | null>(null);
  const [sample, setSample] = useState("Jogador");
  const [price, setPrice] = useState(0);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [giftFont, setGiftFont] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  // Load the picked file in the browser so staff see it before saving (and broken files are caught).
  useEffect(() => {
    if (!file) { setPreviewFamily(null); return; }
    let cancelled = false;
    const family = `nf-preview-${++previewCounter}`;
    file.arrayBuffer().then((buf) => new FontFace(family, buf).load()).then((face) => {
      if (cancelled) return;
      document.fonts.add(face);
      setPreviewFamily(family);
    }).catch(() => {
      if (cancelled) return;
      toast.error("Esse arquivo não é uma fonte válida.");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    });
    return () => { cancelled = true; };
  }, [file]);

  function pick(f: File | null) {
    if (!f) return;
    if (!fontFormat(f.name)) { toast.error("Use um arquivo .ttf, .otf, .woff ou .woff2."); return; }
    if (f.size > FONT_MAX_BYTES) { toast.error("A fonte pode ter no máximo 5 MB."); return; }
    setFile(f);
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 40));
  }

  function reset() {
    setId(null); setName(""); setSavedPath(null); setFile(null); setPrice(0); setActive(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function select(font: { id: string; name: string; file_path: string }) {
    const item = items?.find((i) => i.id === font.id);
    setId(font.id); setName(font.name); setSavedPath(font.file_path); setFile(null);
    setPrice(item?.price ?? 0); setActive(item?.active ?? false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: NAME_FONTS_KEY }),
      qc.invalidateQueries({ queryKey: ["admin-font-items"] }),
      qc.invalidateQueries({ queryKey: ["admin-shop"] }),
      qc.invalidateQueries({ queryKey: ["shop"] }),
      qc.invalidateQueries({ queryKey: EQUIPPED_FONTS_KEY }),
      qc.invalidateQueries({ queryKey: ["player-fonts"] }),
    ]);
  }

  const validPrice = Number.isInteger(price) && price >= 0 && price <= 100000;
  const canSave = !busy && name.trim().length >= 2 && (!!file || !!savedPath) && validPrice && (!file || !!previewFamily);

  async function save() {
    if (!canSave) return;
    setBusy(true);
    const fontId = id ?? newFontId();
    try {
      let path = savedPath;
      if (file) {
        const fmt = fontFormat(file.name);
        if (!fmt) throw new Error("formato");
        path = `${fontId}/${Date.now()}.${fmt.ext}`;
        const up = await supabase.storage.from(FONT_BUCKET).upload(path, file, { contentType: fmt.mime, cacheControl: "31536000", upsert: false });
        if (up.error) throw up.error;
      }
      const r = await supabase.rpc("staff_save_font", { p_id: fontId, p_name: name.trim(), p_path: path as string, p_price: price, p_active: active });
      if (r.error) throw r.error;
      if (file && savedPath && savedPath !== path) await supabase.storage.from(FONT_BUCKET).remove([savedPath]);
      setId(fontId); setSavedPath(path); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
      toast.success(active ? "Fonte salva e colocada na loja." : "Fonte salva (fora da loja).");
    } catch { toast.error("Não consegui salvar a fonte."); } finally { setBusy(false); }
  }

  async function remove(font: { id: string; name: string }) {
    if (busy || !window.confirm(`Apagar a fonte "${font.name}"? Ela sai da loja e some do nome de quem comprou (sem devolver moedas).`)) return;
    setBusy(true);
    try {
      const r = await supabase.rpc("staff_delete_font", { p_id: font.id });
      if (r.error) throw r.error;
      if (r.data) await supabase.storage.from(FONT_BUCKET).remove([r.data]);
      if (id === font.id) reset();
      await refresh();
      toast.success("Fonte apagada.");
    } catch { toast.error("Não consegui apagar a fonte."); } finally { setBusy(false); }
  }

  async function gift(removeIt: boolean) {
    if (!giftFont || !selected.length || busy) return;
    setBusy(true);
    try {
      const r = await supabase.rpc("staff_grant_font", { p_font: giftFont, p_users: selected, p_remove: removeIt });
      if (r.error) throw r.error;
      await refresh();
      const n = r.data ?? 0;
      if (removeIt) toast.success(n ? `Fonte retirada de ${n} jogador(es).` : "Ninguém selecionado tinha ganhado essa fonte (fontes compradas não são retiradas).");
      else toast.success(n ? `Fonte entregue para ${n} jogador(es).` : "Os jogadores selecionados já tinham essa fonte.");
      if (n) setSelected([]);
    } catch { toast.error("Não consegui alterar as fontes dos jogadores."); } finally { setBusy(false); }
  }

  const previewStyle = previewFamily ? { fontFamily: `"${previewFamily}", system-ui, sans-serif` } : undefined;
  const showSaved = !file && savedPath && id;
  const text = sample.trim() || "Jogador";

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Fontes do nome</h2>
          <p className="text-sm text-muted-foreground">Importe uma fonte, dê um nome e um preço. Ela vira um produto da Loja; quem comprar usa no nome.</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={reset}><Plus size={16} />Nova fonte</Button>
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept={FONT_ACCEPT} className="hidden" aria-label="Arquivo da fonte" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><FileType size={16} />{savedPath ? "Trocar arquivo da fonte" : "Importar fonte"}</Button>
            <span className="text-xs text-muted-foreground">.ttf, .otf, .woff ou .woff2 · até 5 MB</span>
          </div>
          <label className="block text-sm">Nome do produto<Input aria-label="Nome da fonte" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Preço em moedas<Input aria-label="Preço da fonte" type="number" min={0} max={100000} value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="Colocar na loja" />Colocar na loja</label>
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <label className="block text-xs text-muted-foreground">Texto da prévia<Input aria-label="Texto da prévia" value={sample} maxLength={30} onChange={(e) => setSample(e.target.value)} /></label>
            {previewStyle ? (
              <>
                <p className="break-words text-4xl" style={previewStyle}>{text}</p>
                <p className="text-sm font-semibold" style={previewStyle}>{text}</p>
              </>
            ) : showSaved ? (
              <>
                <FontSample fontId={id} className="block break-words text-4xl">{text}</FontSample>
                <FontSample fontId={id} className="block text-sm font-semibold">{text}</FontSample>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Importe uma fonte para ver a prévia.</p>
            )}
          </div>
          <Button disabled={!canSave} onClick={save}><Save size={16} />{busy ? "Salvando…" : "Salvar fonte"}</Button>
        </div>
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-xl font-bold">Fontes criadas</h3>
          {error && <p role="alert" className="mt-2 text-destructive">Não consegui carregar as fontes.</p>}
          {!fonts?.length && <p className="mt-3 text-sm text-muted-foreground">Nenhuma fonte ainda.</p>}
          <ul className="mt-2 divide-y divide-border">
            {fonts?.map((f) => {
              const item = items?.find((i) => i.id === f.id);
              return (
                <li key={f.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <FontSample fontId={f.id} className="block truncate text-xl">{f.name}</FontSample>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><ShopCoin className="h-3 w-3" />{item?.price ?? 0} · {item?.active ? "na loja" : "fora da loja"}</span>
                  </div>
                  <Button size="icon" variant={id === f.id ? "default" : "ghost"} aria-label={`Editar fonte ${f.name}`} title="Editar fonte" disabled={busy} onClick={() => select(f)}><Pencil size={16} /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Apagar fonte ${f.name}`} title="Apagar fonte" disabled={busy} onClick={() => remove(f)}><Trash2 size={16} /></Button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="mt-8 space-y-4 border-t border-border pt-5">
        <div>
          <h3 className="font-display text-xl font-bold">Entregar fonte</h3>
          <p className="text-sm text-muted-foreground">Dê uma fonte de presente para quem você quiser. O jogador recebe um aviso e escolhe em Perfil → Fonte do nome, junto com as que já tem.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm">Fonte
              <select aria-label="Fonte para entregar" value={giftFont} onChange={(e) => setGiftFont(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Escolha uma fonte…</option>
                {fonts?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            {giftFont && <FontSample fontId={giftFont} className="block break-words text-3xl">{text}</FontSample>}
            <p className="text-sm text-muted-foreground">{selected.length} jogador(es) selecionado(s)</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!giftFont || !selected.length || busy} onClick={() => gift(false)}><Gift size={16} />Entregar fonte</Button>
              <Button variant="outline" disabled={!giftFont || !selected.length || busy} onClick={() => gift(true)}><Minus size={16} />Retirar fonte</Button>
            </div>
            <p className="text-xs text-muted-foreground">"Retirar" só tira fontes dadas de presente; quem comprou na loja continua com a sua.</p>
          </div>
          <div className="space-y-2">
            <Input aria-label="Buscar jogador para fonte" placeholder="Buscar jogador…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
