import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import type { PlayerProfile } from "@/lib/player-profile";

export function ProfileBanner({ path, name, ambient = false }: { path?: string | null | undefined; name: string; ambient?: boolean }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  if (!path || failedPath === path) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Fades into the surrounding card (bottom + soft side vignette) so the avatar emerges from the image.
  return <div className="relative aspect-[3/1] w-full overflow-hidden rounded-t-lg">
    <img src={data.publicUrl} alt={`Banner de ${name}`} className="h-full w-full object-cover" onError={() => setFailedPath(path)} />
    <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-card/30 ${ambient ? "to-card/40" : "to-card"}`} />
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card/50 via-transparent to-card/50" />
  </div>;
}

export function ProfileBannerEditor({ userId, path, name, controlsOnly = false }: { userId: string; path?: string | null | undefined; name: string; controlsOnly?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const [source, setSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function closeCrop() {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
  }

  async function save(file?: File) {
    if (saving) return;
    setSaving(true);
    let nextPath: string | null = null;
    try {
      if (file) {
        nextPath = `${userId}/banner-${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("avatars").upload(nextPath, file, { cacheControl: "31536000" });
        if (error) throw error;
      }
      const { error } = await supabase.from("profiles").update({ banner_url: nextPath }).eq("id", userId);
      if (error) {
        if (nextPath) await supabase.storage.from("avatars").remove([nextPath]);
        throw error;
      }
      client.setQueryData<PlayerProfile>(["player-profile", userId], current => current ? { ...current, banner_url: nextPath } : current);
      await client.invalidateQueries({ queryKey: ["player-profile", userId] });
      if (path?.startsWith(`${userId}/banner-`)) await supabase.storage.from("avatars").remove([path]);
      toast.success(file ? "Banner atualizado!" : "Banner removido!");
    } catch {
      throw new Error("Não consegui salvar o banner. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mb-6">
    {!controlsOnly && <ProfileBanner path={path} name={name} />}
    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={saving} onClick={() => input.current?.click()}><ImagePlus /> {path ? "Trocar banner" : "Adicionar banner"}</Button>
      {path && <Button variant="ghost" size="icon" disabled={saving} aria-label="Remover banner" title="Remover banner" onClick={() => save().catch(e => toast.error(e.message))}><Trash2 /></Button>}
    </div>
    <input ref={input} aria-label="Imagem do banner" type="file" accept="image/*" className="hidden" onChange={e => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || saving) return;
      if (!file.type.startsWith("image/")) { toast.error("Escolha uma imagem."); return; }
      if (file.size > 5 * 1024 * 1024) { toast.error("O banner pode ter no máximo 5MB."); return; }
      setSource(URL.createObjectURL(file));
    }} />
    {source && <AvatarCropDialog banner source={source} onClose={closeCrop} onSave={save} />}
  </div>;
}