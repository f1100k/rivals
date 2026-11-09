import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trophy, Shield, Target, ThumbsUp } from "lucide-react";
import { Avatar } from "./Avatar";
import { RankBadge } from "./RankBadge";
import { Button } from "./ui/button";
import { StaffTag } from "./StaffTag";
import { EquippedEmblem } from "./Emblems";
import { PlayerName } from "./NameFonts";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { getPlayerProfile } from "@/lib/inhouse.functions";
import type { PlayerProfile } from "@/lib/player-profile";
import { ProfileBanner } from "./ProfileBanner";
import { supabase } from "@/integrations/supabase/client";
import { EquippedProfileTag } from "./ProfileTags";
import { PlayerSeasons } from "./PlayerSeasons";

export function PlayerStats({ profile, bare = false }: { profile: PlayerProfile; bare?: boolean }) {
  const games = profile.wins + profile.losses;
  const stats = [
    ["Reputação", profile.reputation ?? 0], ["Partidas", games], ["Vitórias", profile.wins], ["Derrotas", profile.losses],
    ["Taxa de vitória", `${games ? ((profile.wins / games) * 100).toFixed(1) : "0.0"}%`],
    ["Gols", profile.stats.goals], ["Assistências", profile.stats.assists],
    ["Passes", profile.stats.passes], ["Interceptações", profile.stats.interceptions],
    ["Save/GK", profile.stats.gk_saves],
    ["Partidas no gol", profile.stats.gk_games], ["MVPs", profile.stats.mvps],
  ];
  const list = <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {stats.map(([label, value]) => <div key={label} className="border-b border-border/60 pb-3">
        <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
      </div>)}
    </dl>;
  if (bare) return list;
  return <section className="mt-6 border-t border-border pt-5">
    <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Trophy className="h-4 w-4 text-primary" /> Estatísticas</h3>
    {list}
  </section>;
}

export function PlayerPositions({ profile }: { profile: PlayerProfile }) {
  return <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
    <div><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Target className="h-3.5 w-3.5" /> Posição primária</dt><dd className="mt-1 font-semibold">{profile.primary_position ?? "Não definida"}</dd></div>
    <div><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Shield className="h-3.5 w-3.5" /> Posição secundária</dt><dd className="mt-1 font-semibold">{profile.secondary_position ?? "Não definida"}</dd></div>
  </dl>;
}

export function PlayerReputation({ profile, label = "Curtidas" }: { profile: PlayerProfile; label?: string }) {
  const likes = profile.likes ?? [];
  const total = profile.reputation ?? likes.length;
  return <section className="mt-5 border-t border-border pt-4">
    <h3 className="flex items-center gap-2 font-display text-lg font-bold"><ThumbsUp className="h-4 w-4 text-primary" /> {label} <span className="text-muted-foreground">({total})</span></h3>
    {likes.length === 0
      ? <p className="mt-2 text-sm text-muted-foreground">Ainda ninguém curtiu este jogador.</p>
      : <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {likes.map(like => <li key={like.userId} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/40 bg-primary/10 text-xs font-bold"><Avatar path={like.avatarUrl} name={like.name} userId={like.userId} /></span>
          <span className="min-w-0 flex-1 text-sm font-semibold"><EquippedEmblem userId={like.userId} className="mr-1 h-4 w-4" /><PlayerName userId={like.userId} name={like.name} /> <EquippedProfileTag userId={like.userId} />{(like.count ?? 1) > 1 && <span className="ml-1 text-xs font-bold text-primary">×{like.count}</span>}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{new Date(like.at).toLocaleDateString("pt-BR")}</span>
        </li>)}
      </ul>}
  </section>;
}

/** Blurred copy of the banner behind the whole card so its colors tint the profile background. */
function BannerAmbient({ path }: { path: string }) {
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    <img src={data.publicUrl} alt="" className="h-full w-full scale-125 object-cover opacity-45 blur-3xl saturate-150" />
    <div className="absolute inset-0 bg-gradient-to-b from-card/30 via-card/75 to-card/90" />
  </div>;
}

export function PlayerProfileDialog({ playerId, onClose }: { playerId: string | null; onClose: () => void }) {
  const fn = useServerFn(getPlayerProfile);
  const { data: profile, isPending, error, refetch } = useQuery({
    queryKey: ["player-profile", playerId], queryFn: () => fn({ data: { id: playerId ?? "" } }), enabled: Boolean(playerId), staleTime: 15000,
  });
  return <Dialog open={Boolean(playerId)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="block max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border-border bg-card p-0 [&>button]:z-30 [&>button]:rounded-full [&>button]:bg-card/70 [&>button]:p-1">
      <DialogTitle className={profile?.banner_url ? "sr-only" : "px-5 pt-5 pr-12 font-display text-xl sm:px-7 sm:pt-7"}>Perfil do jogador</DialogTitle>
      <DialogDescription className="sr-only">MMR, posições e estatísticas do jogador na in-house.</DialogDescription>
      {isPending ? <div role="status" className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /><span className="sr-only">Carregando perfil</span></div>
        : error ? <div role="alert" className="p-6"><p>Não consegui carregar o perfil.</p><Button variant="outline" className="mt-3" onClick={() => refetch()}>Tentar novamente</Button></div>
        : profile ? <div className="relative isolate">
          {profile.banner_url && <BannerAmbient path={profile.banner_url} />}
          <ProfileBanner path={profile.banner_url} name={profile.name} ambient />
          <div className={profile.banner_url ? "px-5 pb-5 sm:px-7 sm:pb-7" : "p-5 sm:p-7"}>
          <div className={`relative flex flex-wrap items-start gap-4 ${profile.banner_url ? "-mt-10 px-3" : "mt-5"}`}>
            <span className="relative z-10 grid h-24 w-24 shrink-0 place-items-center rounded-full border-4 border-card bg-card text-3xl font-bold"><Avatar path={profile.avatar_url} name={profile.name} userId={profile.id} /></span>
            <div className={`min-w-0 ${profile.banner_url ? "pt-12" : ""}`}><h2 className="break-words font-display text-2xl font-bold"><EquippedEmblem userId={profile.id} className="mr-1.5 h-8 w-8" /><PlayerName userId={profile.id} name={profile.name} /> <StaffTag userId={profile.id} /></h2><RankBadge rating={profile.rating} className="mt-2" /><p className="mt-2 flex flex-wrap items-center gap-3 text-lg font-bold text-primary">{profile.rating} MMR<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground"><ThumbsUp className="h-3.5 w-3.5 text-primary" /> {profile.reputation ?? 0} curtidas</span></p></div>
          </div>
          <PlayerPositions profile={profile} /><PlayerReputation profile={profile} /><PlayerSeasons profile={profile} />
          </div>
        </div> : <p className="py-8 text-muted-foreground">Jogador não encontrado.</p>}
    </DialogContent>
  </Dialog>;
}