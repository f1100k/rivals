import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { toast } from "sonner";

export function PlayerVideoInbox() {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [playError, setPlayError] = useState(false);
  const { data } = useQuery({ queryKey: ["player-video-inbox"], refetchInterval: 60000, refetchIntervalInBackground: false, retry: false, queryFn: async () => {
    const auth = await supabase.auth.getUser();
    if (!auth.data.user) return null;
    const [videos, views, recipients] = await Promise.all([supabase.from("player_videos").select("id,title,object_path,all_players").eq("active", true).order("created_at"), supabase.from("player_video_views").select("video_id").eq("user_id", auth.data.user.id), supabase.from("player_video_recipients").select("video_id").eq("user_id", auth.data.user.id)]);
    if (videos.error || views.error || recipients.error) throw new Error("Não consegui consultar os vídeos.");
    const unseen = videos.data.filter(v => (v.all_players || recipients.data.some(r => r.video_id === v.id)) && !views.data.some(view => view.video_id === v.id));
    const urls = await Promise.all(unseen.map(async v => {
      const signed = await supabase.storage.from("player-videos").createSignedUrl(v.object_path, 600);
      return signed.data ? { ...v, url: signed.data.signedUrl } : null;
    }));
    return { userId: auth.data.user.id, videos: urls.filter(v => v !== null) };
  }});
  const video = data?.videos.find(v => !dismissed.includes(v.id));
  async function close() {
    if (!video || !data || pending) return;
    setPending(true);
    try {
      const result = await supabase.from("player_video_views").insert({ video_id: video.id, user_id: data.userId });
      if (result.error && result.error.code !== "23505") throw result.error;
      setDismissed(previous => [...previous, video.id]); setPlayError(false);
      await qc.invalidateQueries({ queryKey: ["player-video-inbox"] });
    } catch { toast.error("Não consegui registrar a visualização; você pode fechar e tentar novamente depois."); setDismissed(previous => [...previous, video.id]); }
    finally { setPending(false); }
  }
  return <Dialog open={!!video} onOpenChange={open => { if (!open) void close(); }}><DialogContent className="inset-0 left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col rounded-none border-0 p-4 sm:rounded-none [&>button]:hidden">
    <div className="flex items-center justify-between gap-3"><DialogTitle className="min-w-0 break-words font-display text-xl">{video?.title}</DialogTitle><Button variant="outline" size="icon" aria-label="Fechar vídeo" title="Fechar vídeo" disabled={pending} onClick={close}><X size={18} /></Button></div><DialogDescription className="sr-only">Vídeo enviado pela administração</DialogDescription>
    {video && <video key={video.id} className="min-h-0 w-full flex-1 object-contain" src={video.url} controls autoPlay muted playsInline onEnded={close} onError={() => setPlayError(true)} />}
    {playError && <div className="flex items-center justify-center gap-3"><p className="text-sm text-destructive">Não foi possível reproduzir este vídeo.</p><Button variant="outline" onClick={close}>Fechar</Button></div>}
    <div className="flex justify-center"><Button variant="outline" disabled={pending} onClick={close}><Play size={16} />{pending ? "Aguarde…" : "Concluir"}</Button></div>
  </DialogContent></Dialog>;
}