import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Film, GripVertical, Image as ImageIcon, Minus, Plus, Trash2, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  placeInRotation, promoMediaUrl, promoWidths, clampPromoSize, PROMO_ADMIN_KEY, PROMO_COLUMNS, PROMO_MAX_LABEL, promoFileTooBig, PROMO_ROTATION_KEY, PROMO_SIZE_MAX, PROMO_SIZE_MIN,
  type PromoItem, type PromoKind, type PromoSettings,
} from "@/lib/promos";

const ERRORS: Record<string, string> = {
  sem_permissao: "Apenas admins podem mexer nas divulgações.",
  arquivo_invalido: "Arquivo inválido.",
  promo_items_link_url_check: "O link precisa começar com http:// ou https://.",
};
function errMsg(e: unknown) {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? m;
}

async function fetchAll(): Promise<{ items: PromoItem[]; settings: PromoSettings }> {
  const [items, settings] = await Promise.all([
    supabase.from("promo_items").select(PROMO_COLUMNS).order("created_at", { ascending: false }),
    supabase.from("promo_settings").select("interval_seconds, enabled, size_percent").maybeSingle(),
  ]);
  if (items.error) throw items.error;
  if (settings.error) throw settings.error;
  return { items: (items.data ?? []) as PromoItem[], settings: { size_percent: 100, ...(settings.data ?? {}) } as PromoSettings };
}

const KINDS: { kind: PromoKind; label: string; icon: typeof Type }[] = [
  { kind: "text", label: "Texto", icon: Type },
  { kind: "image", label: "Foto", icon: ImageIcon },
  { kind: "video", label: "Vídeo", icon: Film },
];

export function AdminPromos() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: PROMO_ADMIN_KEY, queryFn: fetchAll });
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];
  const rotation = useMemo(() => items.filter((i) => i.in_rotation).sort((a, b) => a.sort - b.sort), [items]);
  const library = useMemo(() => items.filter((i) => !i.in_rotation), [items]);

  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: PROMO_ADMIN_KEY }), qc.invalidateQueries({ queryKey: PROMO_ROTATION_KEY })]);
  }

  async function saveRotation(ids: string[]) {
    // Optimistic reorder so the drag feels instant.
    qc.setQueryData(PROMO_ADMIN_KEY, (old: typeof data) => old && {
      ...old,
      items: old.items.map((it) => ({ ...it, in_rotation: ids.includes(it.id), sort: ids.includes(it.id) ? ids.indexOf(it.id) + 1 : it.sort })),
    });
    const { error } = await supabase.rpc("admin_set_promo_rotation", { p_ids: ids });
    if (error) toast.error(errMsg(error));
    await refresh();
  }

  async function remove(item: PromoItem) {
    if (!confirm(`Apagar "${item.title || "esta divulgação"}"? Ela sai da rotação e da biblioteca.`)) return;
    setBusy(true);
    try {
      const { data: path, error } = await supabase.rpc("admin_delete_promo", { p_id: item.id });
      if (error) throw error;
      if (path) await supabase.storage.from("promos").remove([path]);
      await refresh();
      toast.success("Divulgação apagada.");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  async function updateRepeats(item: PromoItem, repeats: number) {
    const value = Math.max(1, Math.min(20, repeats));
    const { error } = await supabase.rpc("admin_save_promo", {
      p_id: item.id, p_kind: item.kind, p_title: item.title, p_body: item.body ?? "", p_media_path: item.media_path as string, p_link: item.link_url ?? "", p_repeats: value,
    });
    if (error) toast.error(errMsg(error)); else await refresh();
  }

  // Drag & drop: data carries the item id; drop targets decide placement.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [overLibrary, setOverLibrary] = useState(false);
  const order = rotation.map((r) => r.id);

  function start(e: DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }
  function end() { setDragId(null); setOverIndex(null); setOverLibrary(false); }
  function dropRotation(e: DragEvent, index: number) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    end();
    if (id) void saveRotation(placeInRotation(order, id, index));
  }
  function dropLibrary(e: DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    end();
    if (id && order.includes(id)) void saveRotation(order.filter((x) => x !== id));
  }

  return (
    <section className="mt-4 space-y-4">
      <PromoComposer onCreated={refresh} />
      {data && <PromoSettingsCard settings={data.settings} onSaved={refresh} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <div
          onDragOver={(e) => { e.preventDefault(); setOverLibrary(true); }}
          onDragLeave={() => setOverLibrary(false)}
          onDrop={dropLibrary}
          className={`rounded-xl border bg-card p-4 transition-colors ${overLibrary && dragId && order.includes(dragId) ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <h3 className="font-display text-lg font-bold">Biblioteca</h3>
          <p className="text-sm text-muted-foreground">Tudo que você criou fica guardado aqui. Arraste para a rotação para começar a mostrar.</p>
          <div className="mt-3 space-y-2">
            {library.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nada guardado fora da rotação.</p>}
            {library.map((item) => (
              <PromoCard key={item.id} item={item} dragging={dragId === item.id} onDragStart={start} onDragEnd={end}
                actions={<>
                  <Button size="icon" variant="ghost" aria-label="Adicionar à rotação" onClick={() => saveRotation([...order, item.id])}><Plus className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Apagar" disabled={busy} onClick={() => remove(item)}><Trash2 className="size-4 text-destructive" /></Button>
                </>}
                onRepeats={updateRepeats}
              />
            ))}
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); if (rotation.length === 0) setOverIndex(0); }}
          onDrop={(e) => dropRotation(e, overIndex ?? rotation.length)}
          className={`rounded-xl border-2 border-dashed bg-card p-4 transition-colors ${dragId ? "border-primary bg-primary/5" : "border-primary/40"}`}
        >
          <h3 className="font-display text-lg font-bold">Área de rotação</h3>
          <p className="text-sm text-muted-foreground">Aparece nessa ordem no canto inferior direito da tela de todos. Arraste para reordenar ou de volta para a biblioteca para tirar.</p>
          <ol className="mt-3 space-y-2">
            {rotation.length === 0 && <li className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Solte aqui o que deve aparecer no site.</li>}
            {rotation.map((item, i) => (
              <li key={item.id}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setOverIndex(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
                onDrop={(e) => { e.stopPropagation(); dropRotation(e, overIndex ?? i); }}
                className="relative"
              >
                {dragId && overIndex === i && <div className="absolute -top-1.5 left-0 right-0 h-0.5 rounded bg-primary" />}
                {dragId && overIndex === i + 1 && i === rotation.length - 1 && <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 rounded bg-primary" />}
                <PromoCard item={item} position={i + 1} dragging={dragId === item.id} onDragStart={start} onDragEnd={end} onRepeats={updateRepeats}
                  actions={<>
                    <Button size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => saveRotation(placeInRotation(order, item.id, i - 1))}><ArrowUp className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Descer" disabled={i === rotation.length - 1} onClick={() => saveRotation(placeInRotation(order, item.id, i + 1))}><ArrowDown className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Tirar da rotação" onClick={() => saveRotation(order.filter((x) => x !== item.id))}><Minus className="size-4" /></Button>
                  </>}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function PromoCard({ item, position, dragging, actions, onDragStart, onDragEnd, onRepeats }: {
  item: PromoItem; position?: number; dragging: boolean; actions: React.ReactNode;
  onDragStart: (e: DragEvent, id: string) => void; onDragEnd: () => void; onRepeats: (item: PromoItem, n: number) => void;
}) {
  const media = promoMediaUrl(item.media_path);
  const [repeats, setRepeats] = useState(String(item.video_repeats));
  useEffect(() => setRepeats(String(item.video_repeats)), [item.video_repeats]);
  const Icon = KINDS.find((k) => k.kind === item.kind)?.icon ?? Type;
  return (
    <div draggable onDragStart={(e) => onDragStart(e, item.id)} onDragEnd={onDragEnd}
      className={`flex cursor-grab items-center gap-3 rounded-lg border border-border bg-background/60 p-2 active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}>
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      {position && <span className="w-5 text-center font-display text-sm font-bold text-primary">{position}</span>}
      <div className="flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {item.kind === "image" && media && <img src={media} alt="" className="size-full object-cover" draggable={false} />}
        {item.kind === "video" && media && <video src={media} muted preload="metadata" className="size-full object-cover" />}
        {item.kind === "text" && <span className="line-clamp-3 px-1.5 text-[10px] leading-tight text-muted-foreground">{item.body || item.title}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground"><Icon className="size-3" />{KINDS.find((k) => k.kind === item.kind)?.label}</p>
        <p className="truncate font-semibold">{item.title || <span className="text-muted-foreground">Sem título</span>}</p>
        {item.kind === "video" && (
          <label className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
            Repetir
            <Input type="number" min={1} max={20} value={repeats} onChange={(e) => setRepeats(e.target.value)}
              onBlur={() => { const n = Number(repeats); if (n && n !== item.video_repeats) onRepeats(item, n); }}
              className="h-7 w-14 px-2 text-xs" />
            {Number(repeats) === 1 ? "vez" : "vezes"} antes de trocar
          </label>
        )}
      </div>
      <div className="flex shrink-0 items-center">{actions}</div>
    </div>
  );
}

function PromoSettingsCard({ settings, onSaved }: { settings: PromoSettings; onSaved: () => Promise<void> }) {
  const [interval, setIntervalValue] = useState(settings.interval_seconds);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [size, setSize] = useState(clampPromoSize(settings.size_percent));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setIntervalValue(settings.interval_seconds); setEnabled(settings.enabled); setSize(clampPromoSize(settings.size_percent)); }, [settings.interval_seconds, settings.enabled, settings.size_percent]);
  const dirty = interval !== settings.interval_seconds || enabled !== settings.enabled || size !== clampPromoSize(settings.size_percent);
  async function save() {
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_promo_settings", { p_interval: interval, p_enabled: enabled, p_size: size });
    setSaving(false);
    if (error) return void toast.error(errMsg(error));
    await onSaved();
    toast.success("Configuração salva.");
  }
  const widths = promoWidths(size);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-4">
      <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={enabled} onCheckedChange={setEnabled} />Mostrar no site</label>
      <div className="min-w-56 flex-1">
        <p className="text-sm font-medium">Trocar textos e fotos a cada <span className="font-display text-primary">{interval}s</span></p>
        <Slider className="mt-2" min={3} max={120} step={1} value={[interval]} onValueChange={(v) => setIntervalValue(v[0] ?? interval)} />
        <p className="mt-1 text-xs text-muted-foreground">Vídeos trocam depois de tocar o número de vezes definido em cada um.</p>
      </div>
      <div className="min-w-56 flex-1">
        <p className="text-sm font-medium">Tamanho do quadradinho <span className="font-display text-primary">{size}%</span></p>
        <Slider className="mt-2" min={PROMO_SIZE_MIN} max={PROMO_SIZE_MAX} step={5} value={[size]} onValueChange={(v) => setSize(clampPromoSize(v[0]))} />
        <p className="mt-1 text-xs text-muted-foreground">Largura no celular: {widths.width}px · no computador: {widths.widthLg}px.</p>
      </div>
      <Button onClick={save} disabled={!dirty || saving}>{saving ? "Salvando…" : "Salvar"}</Button>
    </div>
  );
}

function PromoComposer({ onCreated }: { onCreated: () => Promise<void> }) {
  const [kind, setKind] = useState<PromoKind>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [repeats, setRepeats] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ready = kind === "text" ? Boolean(title.trim() || body.trim()) : Boolean(file);

  function pick(f: File | null) {
    if (kind === "text") return;
    if (f && promoFileTooBig(kind, f.size)) { toast.error(`Arquivo maior que ${PROMO_MAX_LABEL[kind]}.`); return; }
    if (f && !f.type.startsWith(kind === "video" ? "video/" : "image/")) { toast.error(kind === "video" ? "Escolha um vídeo." : "Escolha uma imagem."); return; }
    setFile(f);
  }

  async function create() {
    if (!ready || busy) return;
    if (link.trim() && !/^https?:\/\//.test(link.trim())) return void toast.error(ERRORS["promo_items_link_url_check"]);
    setBusy(true);
    let path: string | null = null;
    try {
      if (kind !== "text" && file) {
        const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        path = `${crypto.randomUUID()}/promo.${ext}`;
        if (kind === "video") {
          setProgress(0);
          const { uploadResumable } = await import("@/lib/video-upload-resumable");
          await uploadResumable(file, "promos", path, "31536000", setProgress);
        } else {
          const { error } = await supabase.storage.from("promos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
          if (error) throw error;
        }
      }
      const { error } = await supabase.rpc("admin_save_promo", {
        p_id: null as unknown as string, p_kind: kind, p_title: title, p_body: kind === "text" ? body : "", p_media_path: path as string, p_link: link, p_repeats: repeats,
      });
      if (error) throw error;
      setTitle(""); setBody(""); setLink(""); setRepeats(1); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await onCreated();
      toast.success("Guardado na biblioteca. Arraste para a rotação para mostrar.");
    } catch (e) {
      if (path) await supabase.storage.from("promos").remove([path]);
      toast.error(errMsg(e));
    } finally { setBusy(false); setProgress(null); }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-lg font-bold">Nova divulgação</h3>
      <div className="mt-3 flex gap-2">
        {KINDS.map(({ kind: k, label, icon: Icon }) => (
          <Button key={k} variant={kind === k ? "default" : "outline"} size="sm" onClick={() => { setKind(k); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
            <Icon className="size-4" />{label}
          </Button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Título {kind !== "text" && <span className="text-muted-foreground">(opcional)</span>}
          <Input className="mt-1" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Campeonato de sábado" />
        </label>
        <label className="text-sm">Link ao clicar <span className="text-muted-foreground">(opcional)</span>
          <Input className="mt-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </label>
        {kind === "text" && (
          <label className="text-sm sm:col-span-2">Texto
            <Textarea className="mt-1" maxLength={400} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva a mensagem…" />
          </label>
        )}
        {kind !== "text" && (
          <label className="text-sm">{kind === "video" ? "Vídeo" : "Foto"} <span className="text-muted-foreground">(até {PROMO_MAX_LABEL[kind]})</span>
            <Input ref={fileRef} className="mt-1" type="file" accept={kind === "video" ? "video/*" : "image/*"} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
        )}
        {kind === "video" && (
          <label className="text-sm">Repetir quantas vezes antes de trocar
            <Input className="mt-1" type="number" min={1} max={20} value={repeats} onChange={(e) => setRepeats(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
          </label>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={create} disabled={!ready || busy}>{busy ? (progress !== null ? `Enviando… ${progress}%` : "Enviando…") : "Guardar na biblioteca"}</Button>
      </div>
    </div>
  );
}
