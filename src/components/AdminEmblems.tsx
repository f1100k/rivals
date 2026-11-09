import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, ImagePlus, Minus, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AdminOverview } from "@/lib/inhouse.functions";
import { EMBLEM_BUCKET, EMBLEM_OUTPUT_SIZE, removeBackground, visibleBounds, type Rgba } from "@/lib/emblems";
import { SEASONS_KEY, fetchSeasons } from "@/lib/seasons";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { EQUIPPED_EMBLEMS_KEY, EmblemImage } from "./Emblems";

const checker: CSSProperties = { backgroundImage: "conic-gradient(var(--muted) 25%, var(--card) 0 50%, var(--muted) 0 75%, var(--card) 0)", backgroundSize: "16px 16px" };

/** Loads the picked file, optionally erases its solid background, trims empty borders and fits it in a square PNG. */
async function buildEmblem(file: File, erase: boolean, tolerance: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
  const src = document.createElement("canvas"); src.width = w; src.height = h;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(bitmap, 0, 0, w, h);
  let pixels: Rgba = { data: sctx.getImageData(0, 0, w, h).data, width: w, height: h };
  if (erase) pixels = removeBackground(pixels, tolerance);
  sctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), w, h), 0, 0);
  const box = visibleBounds(pixels) ?? { x: 0, y: 0, width: w, height: h };
  const out = document.createElement("canvas"); out.width = EMBLEM_OUTPUT_SIZE; out.height = EMBLEM_OUTPUT_SIZE;
  const octx = out.getContext("2d")!;
  const fit = (EMBLEM_OUTPUT_SIZE * 0.96) / Math.max(box.width, box.height);
  const dw = box.width * fit, dh = box.height * fit;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, box.x, box.y, box.width, box.height, (EMBLEM_OUTPUT_SIZE - dw) / 2, (EMBLEM_OUTPUT_SIZE - dh) / 2, dw, dh);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}

export function AdminEmblems({ users }: { users: AdminOverview["users"] }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [erase, setErase] = useState(true);
  const [tolerance, setTolerance] = useState(40);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: seasons = [] } = useQuery({ queryKey: SEASONS_KEY, queryFn: fetchSeasons });
  const activeSeason = seasons.find((s) => s.status === "active");
  const [seasonChoice, setSeasonChoice] = useState("auto");
  const grantSeason = seasonChoice === "auto" ? activeSeason?.id ?? null : seasonChoice;
  const { data: emblems, error } = useQuery({ queryKey: ["admin-emblems"], queryFn: async () => {
    const r = await supabase.from("emblems").select("*").order("created_at"); if (r.error) throw r.error; return r.data;
  } });

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    let cancelled = false; let url = "";
    const t = setTimeout(() => {
      buildEmblem(file, erase, tolerance).then((blob) => {
        if (cancelled) return; url = URL.createObjectURL(blob); setPreview({ blob, url });
      }).catch(() => { if (!cancelled) toast.error("Não consegui ler essa imagem."); });
    }, 150);
    return () => { cancelled = true; clearTimeout(t); if (url) URL.revokeObjectURL(url); };
  }, [file, erase, tolerance]);

  function reset() { setId(null); setName(""); setSavedPath(null); setFile(null); setSelected([]); if (fileRef.current) fileRef.current.value = ""; }

  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-emblems"] }), qc.invalidateQueries({ queryKey: EQUIPPED_EMBLEMS_KEY }), qc.invalidateQueries({ queryKey: ["player-emblems"] }), qc.invalidateQueries({ queryKey: ["player-emblems-public"] })]);
  }

  async function save() {
    if (busy || !name.trim() || (!preview && !savedPath)) return; setBusy(true);
    const emblemId = id ?? crypto.randomUUID();
    try {
      let path = savedPath;
      if (preview) {
        path = `${emblemId}/${Date.now()}.png`;
        const up = await supabase.storage.from(EMBLEM_BUCKET).upload(path, preview.blob, { contentType: "image/png", cacheControl: "31536000", upsert: false });
        if (up.error) throw up.error;
      }
      const r = await supabase.rpc("admin_save_emblem", { p_id: emblemId, p_name: name, p_path: path as string });
      if (r.error) throw r.error;
      if (preview && savedPath && savedPath !== path) await supabase.storage.from(EMBLEM_BUCKET).remove([savedPath]);
      setId(r.data); setSavedPath(path); setFile(null); if (fileRef.current) fileRef.current.value = "";
      await refresh(); toast.success("Emblema salvo.");
    } catch { toast.error("Não consegui salvar o emblema."); } finally { setBusy(false); }
  }

  async function remove(emblem: { id: string; name: string }) {
    if (busy || !window.confirm(`Apagar o emblema "${emblem.name}"? Ele some de todos os jogadores que têm.`)) return; setBusy(true);
    try {
      const r = await supabase.rpc("admin_delete_emblem", { p_id: emblem.id }); if (r.error) throw r.error;
      if (r.data) await supabase.storage.from(EMBLEM_BUCKET).remove([r.data]);
      if (id === emblem.id) reset();
      await refresh(); toast.success("Emblema apagado.");
    } catch { toast.error("Não consegui apagar o emblema."); } finally { setBusy(false); }
  }

  async function grant(removeIt: boolean) {
    if (!id || !selected.length || busy) return; setBusy(true);
    try {
      const r = await supabase.rpc("admin_grant_emblem", { p_emblem: id, p_users: selected, p_remove: removeIt, p_season: grantSeason as string });
      if (r.error) throw r.error; await refresh();
      toast.success(removeIt ? "Emblema retirado dos jogadores selecionados." : "Emblema entregue aos jogadores selecionados.");
    } catch { toast.error("Não consegui alterar os emblemas dos jogadores."); } finally { setBusy(false); }
  }

  const shown = preview?.url ?? null;
  return <section className="mt-6">
    <div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-bold">Emblemas</h2><Button variant="outline" disabled={busy} onClick={reset}><Plus size={16} />Novo emblema</Button></div>
    <div className="mt-6 grid gap-8 lg:grid-cols-2">
      <div className="space-y-4 border-t border-border pt-5">
        <label className="block text-sm">Nome do emblema<Input aria-label="Nome do emblema" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Imagem do emblema" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><ImagePlus size={16} />{savedPath ? "Trocar imagem" : "Escolher imagem"}</Button>
          <span className="text-xs text-muted-foreground">PNG, JPG ou WEBP. O fundo é apagado automaticamente.</span>
        </div>
        {file && <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={erase} onChange={(e) => setErase(e.target.checked)} />Apagar o fundo da imagem</label>
          {erase && <label className="block text-sm">Força para apagar o fundo: {tolerance}
            <input type="range" min={5} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="mt-1 w-full accent-primary" aria-label="Força para apagar o fundo" />
            <span className="block text-xs text-muted-foreground">Se sobrar fundo, aumente. Se começar a apagar o emblema, diminua.</span>
          </label>}
        </div>}
        <div className="flex flex-wrap items-end gap-6 border-y border-border py-4">
          <div className="grid h-32 w-32 place-items-center rounded-lg border border-border" style={checker}>
            {shown ? <img src={shown} alt="Prévia do emblema" className="h-28 w-28 object-contain" /> : savedPath ? <EmblemImage path={savedPath} name={name} className="h-28 w-28" /> : <span className="text-xs text-muted-foreground">Prévia</span>}
          </div>
          <div className="text-sm">
            <p className="mb-2 text-xs text-muted-foreground">Como fica no nome:</p>
            <p className="flex items-center gap-1.5 font-semibold">{shown ? <img src={shown} alt="" className="h-5 w-5 object-contain" /> : savedPath && <EmblemImage path={savedPath} name={name} />}{"Jogador"}</p>
          </div>
        </div>
        <Button disabled={busy || !name.trim() || (!preview && !savedPath)} onClick={save}><Save size={16} />Salvar emblema</Button>
        {error && <p role="alert" className="text-destructive">Não consegui carregar os emblemas.</p>}
        <ul className="divide-y divide-border">{emblems?.map((e) => <li key={e.id} className="flex items-center gap-3 py-3">
          <EmblemImage path={e.image_path} name={e.name} className="h-9 w-9" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.name}</span>
          <Button size="icon" variant={id === e.id ? "default" : "ghost"} aria-label={`Selecionar emblema ${e.name}`} title="Editar e entregar emblema" disabled={busy} onClick={() => { setId(e.id); setName(e.name); setSavedPath(e.image_path); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}><Pencil size={16} /></Button>
          <Button size="icon" variant="ghost" aria-label={`Apagar emblema ${e.name}`} title="Apagar emblema" disabled={busy} onClick={() => remove(e)}><Trash2 size={16} /></Button>
        </li>)}</ul>
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="font-display text-xl font-bold">Entregar emblema</h3>
        <p className="text-sm text-muted-foreground">{id ? name : "Selecione um emblema salvo"} · {selected.length} jogadores selecionados</p>
        <label className="block text-sm">Season do emblema
          <select aria-label="Season do emblema" value={seasonChoice} onChange={(e) => setSeasonChoice(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="auto">{activeSeason ? `Season atual (${activeSeason.name})` : "Season atual (nenhuma ativa)"}</option>
            {seasons.filter((s) => s.status !== "planned").map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "finished" ? " (finalizada)" : ""}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">O emblema entra nas conquistas dessa season no perfil do jogador.</span>
        </label>
        <Input aria-label="Buscar jogador para emblema" placeholder="Buscar jogador…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-80 divide-y divide-border overflow-y-auto">{users.filter((u) => !u.isGhost && u.name.toLowerCase().includes(search.toLowerCase())).map((u) => <label key={u.id} className="flex items-center gap-3 py-3 text-sm"><input type="checkbox" checked={selected.includes(u.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, u.id] : selected.filter((v) => v !== u.id))} />{u.name}</label>)}</div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!id || !selected.length || busy} onClick={() => grant(false)}><Gift size={16} />Entregar emblema</Button>
          <Button variant="outline" disabled={!id || !selected.length || busy} onClick={() => grant(true)}><Minus size={16} />Retirar emblema</Button>
        </div>
      </div>
    </div>
  </section>;
}
