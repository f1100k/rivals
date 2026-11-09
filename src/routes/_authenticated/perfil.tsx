import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Camera, Save, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, useAvatarFrameClass, useFrameFits, useFrameCatalog } from "@/components/Avatar";
import { RankBadge } from "@/components/RankBadge";
import { supabase } from "@/integrations/supabase/client";
import { tierProgress } from "@/lib/inhouse";
import { getInhouseStateGk, renameProfile, getPlayerProfile } from "@/lib/inhouse.functions";
import { PlayerReputation } from "@/components/PlayerProfile";
import { PlayerSeasons } from "@/components/PlayerSeasons";
import { ProfilePositionsEditor } from "@/components/ProfilePositionsEditor";
import { DiscordLinkCard } from "@/components/DiscordLinkCard";
import { LossShieldCard } from "@/components/LossShieldCard";
import { availableAvatarFrames, frameStyle, resolveFit } from "@/lib/avatar-frames";
import { setAvatarFrame } from "@/lib/avatar-frames.functions";
import { FrameFitEditor } from "@/components/FrameFitEditor";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import { DeleteAccountCard } from "@/components/DeleteAccountCard";
import { ProfileBanner, ProfileBannerEditor } from "@/components/ProfileBanner";
import { useHasFeature } from "@/hooks/use-has-feature";
import { ProfileTags } from "@/components/ProfileTags";
import { StaffTag } from "@/components/StaffTag";
import { EquippedEmblem, MyEmblems } from "@/components/Emblems";
import { MyNameColors, MyNameFonts, PlayerName } from "@/components/NameFonts";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil · Inhouse Rematch" },
      { name: "description", content: "Personalize sua foto, banner e nick e acompanhe suas estatísticas na Inhouse Rematch." },
      { property: "og:title", content: "Perfil · Inhouse Rematch" },
      {
        property: "og:description",
        content: "Personalize sua foto, banner e nick e acompanhe suas estatísticas na Inhouse Rematch.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const stateFn = useServerFn(getInhouseStateGk);
  const renameFn = useServerFn(renameProfile);
  const { data: state } = useQuery({ queryKey: ["inhouse-gk"], queryFn: () => stateFn() });
  const queryClient = useQueryClient();
  const me = state?.me;
  const canBanner = useHasFeature(me?.id, "banner");
  const profileFn = useServerFn(getPlayerProfile);
  const { data: profile, error: profileError } = useQuery({
    queryKey: ["player-profile", me?.id],
    queryFn: () => profileFn({ data: { id: me?.id ?? "" } }),
    enabled: Boolean(me?.id),
  });
  const rating = me?.rating ?? 0;
  const prog = tierProgress(rating);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [nick, setNick] = useState("");
  const [savingNick, setSavingNick] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);

  function closeCrop() {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(null);
  }

  function selectPhoto(file: File | undefined) {
    if (!file || uploading) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha uma imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A foto pode ter no máximo 5MB.");
      return;
    }
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(URL.createObjectURL(file));
  }

  async function onAvatarPicked(file: File | undefined) {
    if (!file || !me?.id || uploading) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A foto pode ter no máximo 5MB.");
      return;
    }
    setUploading(true);
    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const path = `${me.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (!error) {
      const { error: profileSaveError } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", me.id);
      if (profileSaveError) {
        setUploading(false);
        throw new Error("Não consegui salvar a foto. Tenta de novo.");
      }
      await queryClient.invalidateQueries({ queryKey: ["inhouse-gk"] });
      await queryClient.invalidateQueries({ queryKey: ["player-profile", me?.id] });
      await queryClient.invalidateQueries({ queryKey: ["ranking"] });
      toast.success("Foto atualizada!");
    } else {
      setUploading(false);
      throw new Error("Não consegui salvar a foto. Tenta de novo.");
    }
    setUploading(false);
  }

  async function saveNick() {
    const name = nick.trim();
    if (!name || savingNick) return;
    setSavingNick(true);
    try {
      await renameFn({ data: { name } });
      await queryClient.invalidateQueries({ queryKey: ["inhouse-gk"] });
      toast.success("Nick atualizado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar o nick.");
    }
    setSavingNick(false);
  }

  const setFrameFn = useServerFn(setAvatarFrame);
  const myFrame = useAvatarFrameClass(me?.id);
  const frameFits = useFrameFits();
  const { data: canEditFits } = useQuery({
    queryKey: ["can-edit-frame-fits", me?.id],
    enabled: Boolean(me?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_edit_frame_fits");
      if (error) return false;
      return Boolean(data);
    },
  });
  const { data: grantedFrames } = useQuery({
    queryKey: ["avatar-frame-access", me?.id],
    enabled: Boolean(me?.id),
    queryFn: async () => {
      if (!me?.id) return [];
      const { data, error } = await supabase.from("avatar_frame_access").select("frame").eq("user_id", me.id);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => row.frame);
    },
    staleTime: 60_000,
  });
  const catalog = useFrameCatalog();
  const frames = availableAvatarFrames(Boolean(me?.isStaff), grantedFrames, catalog);
  const [savingFrame, setSavingFrame] = useState<string | null>(null);

  async function saveFrame(frame: string | null) {
    if (savingFrame) return;
    setSavingFrame(frame ?? "none");
    try {
      await setFrameFn({ data: { frame } });
      await queryClient.invalidateQueries({ queryKey: ["avatar-frames"] });
      toast.success(frame ? "Moldura aplicada!" : "Moldura removida!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar a moldura.");
    } finally {
      setSavingFrame(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {cropSource && <AvatarCropDialog source={cropSource} onClose={closeCrop} onSave={onAvatarPicked} />}
      <h1 className="font-display text-3xl font-bold">Perfil</h1>
      <p className="mt-1 text-sm text-muted-foreground">Só você edita a sua conta.</p>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        {profile?.banner_url && <div className="-mx-6 -mt-6 overflow-hidden rounded-t-2xl"><ProfileBanner path={profile.banner_url} name={profile.name} /></div>}
        <div className={`relative flex flex-col items-center gap-4 ${profile?.banner_url ? "-mt-16" : "pt-5"}`}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Trocar foto de perfil"
            disabled={uploading}
            className="group relative z-10 h-32 w-32 shrink-0 rounded-full border-4 border-card bg-card font-display text-5xl font-bold text-primary transition hover:brightness-110 disabled:opacity-60"
          >
            <Avatar path={me?.avatar_url} name={me?.name ?? "?"} userId={me?.id} />
            <span className="absolute inset-x-0 bottom-0 grid place-items-center bg-background/70 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground opacity-0 transition group-hover:opacity-100">
              <Camera className="h-4 w-4" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              selectPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="w-full min-w-0 text-center">
            <p className="flex flex-wrap items-center justify-center gap-2 font-display text-2xl font-bold"><EquippedEmblem userId={me?.id} className="h-8 w-8" /><PlayerName userId={me?.id} name={me?.name ?? "Carregando..."} /><StaffTag userId={me?.id ?? null} /></p>
            {me && <div className="flex justify-center"><ProfileTags userId={me.id} /></div>}
            {me && <MyEmblems userId={me.id} />}
            {me && <MyNameFonts userId={me.id} name={me.name} />}
            {me && <MyNameColors userId={me.id} name={me.name} />}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm">
              <RankBadge rating={rating} />
              <span className="font-semibold">{rating} MMR</span>
              <span className="text-muted-foreground">
                {me?.wins ?? 0}V · {me?.losses ?? 0}D
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold">
                <ThumbsUp className="h-3.5 w-3.5 text-primary" /> {profile?.reputation ?? 0} curtidas
              </span>
            </div>
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${prog.pct * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {prog.next ? `${prog.left} pts para ${prog.next}` : "Rank máximo"}
              </p>
            </div>
          </div>
        </div>

        {me && profile && canBanner && <ProfileBannerEditor controlsOnly userId={me.id} path={profile.banner_url} name={me.name} />}
        <div className="mt-6 border-t border-border pt-6">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nick</label>
          <div className="mt-2 flex gap-2">
            <Input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder={me?.name ?? "Seu nick"}
              maxLength={20}
            />
            <Button
              onClick={saveNick}
              disabled={savingNick || !nick.trim()}
              className="shrink-0 font-display uppercase"
            >
              <Save /> Salvar
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Entre 2 e 20 caracteres. É o nome que aparece pra todo mundo.
          </p>
        </div>
        {frames.length > 0 && (
          <section className="mt-6 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Molduras</p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
              <button
                type="button"
                onClick={() => saveFrame(null)}
                disabled={!!savingFrame}
                aria-label="Remover moldura"
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition disabled:opacity-60 ${!myFrame ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
              >
                <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-muted font-bold">
                  {(me?.name ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="text-center text-[10px] font-semibold leading-tight">Nenhuma</span>
              </button>
              {frames.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => saveFrame(f.id)}
                  disabled={!!savingFrame}
                  title={f.label}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition disabled:opacity-60 ${myFrame === f.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                >
                  <span className="relative grid h-10 w-10 place-items-center rounded-full bg-muted font-bold">
                    {(me?.name ?? "?").slice(0, 1).toUpperCase()}
                    <img
                      src={f.image}
                      alt=""
                      aria-hidden
                      className="avatar-frame-img"
                      style={frameStyle(resolveFit(f, frameFits.data?.[f.id]))}
                    />
                  </span>
                  <span className="text-center text-[10px] font-semibold leading-tight">{f.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {canEditFits && me && <FrameFitEditor avatarPath={me.avatar_url} name={me.name ?? ""} initialFrame={myFrame} />}
        {me?.id && <LossShieldCard userId={me.id} />}
        <DiscordLinkCard />
        {profile && (
          <>
            <ProfilePositionsEditor
              key={`${profile.id}-${profile.primary_position}-${profile.secondary_position}`}
              profile={profile}
            />
            <PlayerReputation profile={profile} label="Minhas curtidas" />
            <PlayerSeasons profile={profile} />
          </>
        )}
        {profileError && (
          <p role="alert" className="mt-6 text-destructive">
            Não consegui carregar suas estatísticas.
          </p>
        )}
        <DeleteAccountCard />
      </section>
    </main>
  );
}
