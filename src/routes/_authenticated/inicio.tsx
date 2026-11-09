import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowRight, Camera, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { CommunityJoin } from "@/components/CommunityJoin";
import { LiveMatches } from "@/components/LiveMatches";
import { RankBadge } from "@/components/RankBadge";
import { EquippedProfileTag } from "@/components/ProfileTags";
import { EquippedEmblem } from "@/components/Emblems";
import { PlayerName } from "@/components/NameFonts";
import { supabase } from "@/integrations/supabase/client";
import { tierProgress } from "@/lib/inhouse";
import { fetchMatches, getInhouseStateGk } from "@/lib/inhouse.functions";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({
    meta: [
      { title: "Início · Inhouse Rematch" },
      { name: "description", content: "Seu perfil, rank, MMR e partidas recentes. Entre na fila 5v5 com um clique." },
      { property: "og:title", content: "Início · Inhouse Rematch" },
      { property: "og:description", content: "Seu perfil, rank, MMR e partidas recentes. Entre na fila 5v5 com um clique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const stateFn = useServerFn(getInhouseStateGk);
  const { data: state } = useQuery({ queryKey: ["inhouse-gk"], queryFn: () => stateFn() });
  const { data: matches } = useQuery({ queryKey: ["matches"], queryFn: () => fetchMatches() });
  const me = state?.me;
  const rating = me?.rating ?? 1000;
  const prog = tierProgress(rating);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onAvatarPicked(file: File | undefined) {
    if (!file || !me?.id || uploading) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("A foto pode ter no máximo 5MB.");
      return;
    }
    setUploading(true);
    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const path = `${me.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (!error) {
      await supabase.from("profiles").update({ avatar_url: path }).eq("id", me.id);
      await queryClient.invalidateQueries({ queryKey: ["inhouse-gk"] });
    } else {
      alert("Não consegui salvar a foto. Tenta de novo.");
    }
    setUploading(false);
  }

  const mine = (matches ?? [])
    .map((m) => ({ m, p: m.players.find((p) => p.name === me?.name) }))
    .filter((x) => x.p)
    .slice(0, 10);
  const inGame = !!state?.match || !!state?.queue;

  return (
    <main className="mx-auto max-w-6xl space-y-3 px-4 py-4 md:space-y-6 md:py-8">
      <section className="rounded-2xl border border-border bg-card p-4 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Trocar foto de perfil"
            disabled={uploading}
            className="group relative h-16 w-16 shrink-0 rounded-full border-2 border-primary bg-primary/15 font-display text-2xl font-bold text-primary shadow-[0_0_30px_-5px_var(--color-primary)] transition hover:brightness-110 disabled:opacity-60 md:h-24 md:w-24 md:text-4xl"
          >
            <Avatar path={me?.avatar_url} name={me?.name ?? "?"} userId={me?.id} />
            <span className="absolute inset-x-0 bottom-0 grid place-items-center bg-background/70 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground opacity-0 transition group-hover:opacity-100">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onAvatarPicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex-1 space-y-2">
            <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold md:text-3xl"><EquippedEmblem userId={me?.id} className="h-8 w-8" /><PlayerName userId={me?.id} name={me?.name ?? "Carregando..."} /><EquippedProfileTag userId={me?.id} /></h1>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <RankBadge rating={rating} />
              <span className="font-semibold">{rating} MMR</span>
              <span className="text-muted-foreground">{me?.wins ?? 0}V · {me?.losses ?? 0}D</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-5 font-display text-base uppercase md:h-14 md:px-8 md:text-lg">
              <Link to="/queue">{inGame ? "Voltar pra partida" : "Entrar na fila"} <ArrowRight /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-5 font-display text-base uppercase md:h-14 md:px-8 md:text-lg">
              <Link to="/perfil"><UserRound /> Perfil</Link>
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-2 md:mt-6">
          <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Progresso do rank</span>
            <span>{prog.next ? `${prog.left} pts para ${prog.next}` : "Rank máximo"}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${prog.pct * 100}%` }} />
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-3 md:space-y-6">
      <CommunityJoin />

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-xl font-bold">Histórico recente</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não jogou nenhuma partida.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="py-2">Resultado</th><th>Data</th><th>Time</th><th>Placar</th><th className="text-right">MMR</th></tr>
            </thead>
            <tbody>
              {mine.map(({ m, p }) => {
                const d = p!.delta ?? 0;
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className={`py-2 font-semibold ${d >= 0 ? "text-primary" : "text-destructive"}`}>{d >= 0 ? "Vitória" : "Derrota"}</td>
                    <td>{new Date(m.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td>Time {p!.team.toUpperCase()}</td>
                    <td>{m.scoreA ?? "-"} × {m.scoreB ?? "-"}</td>
                    <td className={`text-right font-semibold ${d >= 0 ? "text-primary" : "text-destructive"}`}>{d >= 0 ? `+${d}` : d}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
        </div>
        <LiveMatches />
      </div>
    </main>
  );
}
