import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, Film } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AdminOverview } from "@/lib/inhouse.functions";
import { MAX_VIDEO_LABEL, validPlayerVideo } from "@/lib/video-upload";
import { uploadPlayerVideo } from "@/lib/video-upload-resumable";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

export function AdminVideos({ users }: { users: AdminOverview["users"] }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const { data: videos, error } = useQuery({ queryKey: ["admin-videos"], queryFn: async () => {
    const result = await supabase.from("player_videos").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error; return result.data;
  }});
  async function refresh() { await Promise.all([qc.invalidateQueries({ queryKey: ["admin-videos"] }), qc.invalidateQueries({ queryKey: ["player-video-inbox"] })]); }
  async function upload() {
    if (!file || busy || title.trim().length < 2 || (!all && !selected.length)) return;
    setBusy(true); setProgress(0); let path: string | null = null;
    try {
      const auth = await supabase.auth.getUser(); if (!auth.data.user) throw new Error("Entre novamente na sua conta.");
      path = `${auth.data.user.id}/${crypto.randomUUID()}.${file.type === "video/webm" ? "webm" : "mp4"}`;
      await uploadPlayerVideo(file, path, setProgress);
      const result = await supabase.rpc("admin_publish_video", { p_title: title, p_path: path, p_all: all, p_users: all ? [] : selected });
      if (result.error) throw result.error;
      path = null; setFile(null); setTitle(""); setSelected([]); await refresh(); toast.success("Vídeo enviado aos jogadores.");
    } catch (e) { if (path) await supabase.storage.from("player-videos").remove([path]); toast.error(e instanceof Error ? e.message : "Não consegui enviar o vídeo."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!removing || busy) return; setBusy(true);
    try {
      // The file goes first: the record only disappears once the bytes are really gone, so a failed
      // deletion leaves a retryable video instead of a record pointing at a missing file.
      const target = videos?.find(v => v.id === removing);
      if (target) {
        const deleted = await supabase.storage.from("player-videos").remove([target.object_path]);
        if (deleted.error) throw new Error("Não consegui apagar o arquivo do vídeo. Tente novamente.");
      }
      const result = await supabase.rpc("admin_remove_video", { p_video: removing });
      if (result.error) throw result.error;
      await refresh(); setRemoving(null); toast.success("Vídeo apagado do site e do armazenamento.");
    } catch (e) { await refresh(); toast.error(e instanceof Error ? e.message : "Não consegui apagar o vídeo."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6">
    <h2 className="font-display text-2xl font-bold">Vídeos para jogadores</h2>
    <div className="mt-5 grid gap-8 lg:grid-cols-2">
      <div className="min-w-0 space-y-4 border-t border-border pt-5">
        <label className="block text-sm">Título<Input aria-label="Título do vídeo" maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <input ref={fileRef} type="file" className="hidden" accept="video/mp4,video/webm" aria-label="Arquivo do vídeo" onChange={e => { const next = e.target.files?.[0]; e.target.value = ""; if (!next) return; if (!validPlayerVideo(next)) { toast.error(`Escolha MP4 ou WebM de até ${MAX_VIDEO_LABEL}.`); return; } setFile(next); }} />
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} />Escolher vídeo</Button>
        <p className="break-words text-sm text-muted-foreground">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : `MP4 ou WebM · até ${MAX_VIDEO_LABEL}`}</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Todos os jogadores</label>
        {!all && <><Input aria-label="Buscar destinatários do vídeo" placeholder="Buscar jogador…" value={search} onChange={e => setSearch(e.target.value)} /><p className="text-xs text-muted-foreground">{selected.length} selecionados</p><div className="max-h-64 overflow-y-auto divide-y divide-border">{users.filter(u => !u.isGhost && u.name.toLowerCase().includes(search.toLowerCase())).map(u => <label key={u.id} className="flex items-center gap-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(u.id)} onChange={e => setSelected(e.target.checked ? [...selected, u.id] : selected.filter(id => id !== u.id))} />{u.name}</label>)}</div></>}
        <Button disabled={busy || !file || title.trim().length < 2 || (!all && !selected.length)} onClick={upload}><Upload size={16} />{busy ? `Enviando… ${progress}%` : "Enviar vídeo"}</Button>
      </div>
      <div className="min-w-0 border-t border-border pt-5"><h3 className="font-display text-xl font-bold">Vídeos enviados</h3>{error && <p className="mt-3 text-destructive">{error.message}</p>}{videos?.length === 0 && <p className="mt-4 text-muted-foreground">Nenhum vídeo enviado.</p>}<ul className="mt-3 divide-y divide-border">{videos?.map(v => <li key={v.id} className="flex items-center gap-3 py-4"><Film className="shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="break-words font-semibold">{v.title}</p><p className="text-xs text-muted-foreground">{v.all_players ? "Todos os jogadores" : "Jogadores selecionados"} · {new Date(v.created_at).toLocaleDateString("pt-BR")}{!v.active && " · Oculto"}</p></div><Button size="icon" variant="destructive" title="Apagar vídeo" aria-label={`Apagar vídeo ${v.title}`} disabled={busy} onClick={() => setRemoving(v.id)}><Trash2 size={16} /></Button></li>)}</ul></div>
    </div>
    <Dialog open={!!removing} onOpenChange={open => { if (!open && !busy) setRemoving(null); }}><DialogContent><DialogTitle>Apagar vídeo?</DialogTitle><DialogDescription>O arquivo é apagado do armazenamento e o vídeo some do site para todos os destinatários.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={remove}><Trash2 size={16} />Confirmar exclusão</Button></div></DialogContent></Dialog>
  </section>;
}