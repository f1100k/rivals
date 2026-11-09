import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SeasonPicker } from "@/components/SeasonPicker";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchMatches } from "@/lib/inhouse.functions";
import { EquippedProfileTag } from "@/components/ProfileTags";
import { EquippedEmblem } from "@/components/Emblems";
import { PlayerName } from "@/components/NameFonts";

export const Route = createFileRoute("/partidas")({
  head: () => ({
    meta: [
      { title: "Partidas · Inhouse Rematch" },
      { name: "description", content: "Histórico das partidas in-house com placar e variação de rating dos jogadores." },
      { property: "og:title", content: "Partidas · Inhouse Rematch" },
      {
        property: "og:description",
        content: "Histórico das partidas in-house com placar e variação de rating dos jogadores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Matches,
});

function Matches() {
  const fetchFn = useServerFn(fetchMatches);
  const [season, setSeason] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["matches", season ?? "atual"],
    queryFn: () => fetchFn({ data: { season } }),
    refetchInterval: season ? false : 30000, refetchIntervalInBackground: false,
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-4xl font-bold">Partidas</h1>
      <SeasonPicker value={season} onChange={setSeason} className="mt-4" />
      {data.length === 0 && <p className="mt-6 text-muted-foreground">Nenhuma partida jogada ainda.</p>}
      <div className="mt-6 space-y-4">
        {data.map((m) => {
          const aWin = (m.scoreA ?? 0) > (m.scoreB ?? 0);
          const side = (team: string, tone: string, win: boolean) => (
            <div className={win ? "" : "opacity-70"}>
              <ul className="space-y-1 text-sm">
                {m.players.filter((p) => p.team === team).map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className={`min-w-0 break-words ${tone}`}><EquippedEmblem userId={p.userId} className="mr-1 h-4 w-4" /><PlayerName userId={p.userId} name={p.name} /> <EquippedProfileTag userId={p.userId} /></span>
                    <span className={(p.delta ?? 0) >= 0 ? "text-primary" : "text-destructive"}>
                      {(p.delta ?? 0) >= 0 ? "+" : ""}{p.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
          return (
            <article key={m.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                <span>{m.mode}v{m.mode} · {m.region}</span>
                <span>{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
                {side("a", "text-team-a", aWin)}
                {m.scoreA != null && m.scoreB != null ? (
                  <div className="font-display text-3xl font-bold">
                    <span className="text-team-a">{m.scoreA}</span> × <span className="text-team-b">{m.scoreB}</span>
                  </div>
                ) : (
                  <div className="font-display text-xl font-bold text-muted-foreground">vs</div>
                )}
                {side("b", "text-team-b", !aWin)}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
