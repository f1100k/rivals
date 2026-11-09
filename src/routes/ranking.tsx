import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { RankBadge } from "@/components/RankBadge";
import { fetchRanking } from "@/lib/inhouse.functions";
import { StatBoard, STAT_BOARDS, type StatKey } from "@/components/StatLeaders";
import { Button } from "@/components/ui/button";
import { PlayerSearch } from "@/components/PlayerSearch";
import { PlayerProfileDialog } from "@/components/PlayerProfile";
import { StaffTag } from "@/components/StaffTag";
import { EquippedEmblem } from "@/components/Emblems";
import { PlayerName } from "@/components/NameFonts";
import { MixMvpRanking, MixRanking } from "@/components/MixMode";
import { RankingViewPicker, type RankingView } from "@/components/SeasonPicker";
import { RivalsLeagueRanking } from "@/components/RivalsLeague";

export const Route = createFileRoute("/ranking")({
  validateSearch: (search): { q?: string } => ({ q: typeof search["q"] === "string" ? search["q"].slice(0, 80) : "" }),
  head: () => ({
    meta: [
      { title: "Ranking · Inhouse Rematch" },
      { name: "description", content: "Classificação dos jogadores da in-house por rating." },
      { property: "og:title", content: "Ranking · Inhouse Rematch" },
      { property: "og:description", content: "Classificação dos jogadores da in-house por rating." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Ranking,
});

function useMyId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setId(data.user?.id ?? null));
  }, []);
  return id;
}

function Ranking() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const myId = useMyId();
  const fetchFn = useServerFn(fetchRanking);
  const [view, setView] = useState<RankingView>({ kind: "season", id: null });
  const season = view.kind === "season" ? view.id : null;
  const league = view.kind === "league" ? view.id : null;
  const { data = [] } = useQuery({
    queryKey: ["ranking", season ?? "atual"],
    queryFn: () => fetchFn({ data: { season } }),
    enabled: !league,
    refetchInterval: season ? false : 30000, refetchIntervalInBackground: false,
  });

  const [tab, setTab] = useState<"mmr" | "mix" | "mixmvp" | "league" | StatKey>("mmr");
  const tabs = league
    ? [{ key: "league" as const, title: "Rivals League" }, ...STAT_BOARDS]
    : [{ key: "mmr" as const, title: "Inhouse" }, { key: "mix" as const, title: "Mix" }, { key: "mixmvp" as const, title: "Mix MVP" }, ...STAT_BOARDS];
  function changeView(v: RankingView) {
    setView(v);
    if (v.kind === "league" && (tab === "mmr" || tab === "mix" || tab === "mixmvp")) setTab("league");
    if (v.kind === "season" && tab === "league") setTab("mmr");
  }
  const podium = [3, 1, 0, 2, 4].map((i) => ({ p: data[i], i })).flatMap((x) => (x.p ? [{ p: x.p, i: x.i }] : []));
  const heights = ["h-28", "h-36", "h-44", "h-32", "h-24"];
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold sm:text-4xl">Ranking</h1>
      <p className="mt-1 text-sm text-muted-foreground">Os melhores jogadores da in-house por MMR.</p>
      <PlayerSearch search={q ?? ""} onSearch={(value) => navigate({ search: { q: value }, replace: true })} onSelect={setPlayerId} />
      <RankingViewPicker value={view} onChange={changeView} withLeague className="mt-6" />
      {season && <p className="mt-2 text-xs text-muted-foreground">Resultado final guardado dessa season.</p>}
      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <Button key={t.key} type="button" variant="outline" onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            Rank {t.title}
          </Button>
        ))}
      </div>
      {league && tab === "league" ? <RivalsLeagueRanking eventId={league} myId={myId} onPlayerSelect={setPlayerId} /> : tab === "mix" ? <MixRanking onPlayerSelect={setPlayerId} season={season} /> : tab === "mixmvp" ? <MixMvpRanking onPlayerSelect={setPlayerId} season={season} /> : tab !== "mmr" && tab !== "league" ? <StatBoard stat={tab} onPlayerSelect={setPlayerId} season={season} league={league} /> : <>
      {podium.length > 0 && (
        <div className="mt-10 flex items-end justify-center gap-1.5 sm:gap-4">
          {podium.map(({ p, i }) => (
            <div key={p.id} className="flex w-[4.5rem] min-w-0 flex-col items-center text-center sm:w-36">
              <div className={`grid place-items-center rounded-full border-4 bg-card font-display font-bold ${i === 0 ? "h-16 w-16 border-primary text-2xl text-primary glow sm:h-24 sm:w-24 sm:text-3xl" : "h-12 w-12 border-border text-base sm:h-16 sm:w-16 sm:text-xl"}`}>
                <Avatar path={p.avatar_url} name={p.name} userId={p.id} />
              </div>
              <span className="relative z-20 -mt-3 rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">#{i + 1}</span>
              <Button variant="link" className="relative z-20 mt-2 h-auto w-full min-w-0 px-0 text-foreground" onClick={() => setPlayerId(p.id)} aria-label={`Ver perfil de ${p.name}`}><EquippedEmblem userId={p.id} className="mr-1 h-5 w-5" /><PlayerName userId={p.id} name={p.name} className="truncate" /><StaffTag userId={p.id} className="ml-1" /></Button>
              <div className="hidden sm:block"><RankBadge rating={p.rating} className="mt-1" /></div>
              <p className="mt-1 font-display text-base font-bold sm:text-xl">{p.rating}</p>
              <p className="text-[10px] text-muted-foreground">{p.wins}V - {p.losses}D</p>
              <div className={`mt-2 w-full rounded-t-lg border border-b-0 border-border bg-gradient-to-b from-card to-primary/10 ${heights[[3, 1, 0, 2, 4].indexOf(i)]}`} />
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm sm:min-w-[720px]">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-2 sm:p-3">#</th><th className="p-2 sm:p-3">Jogador</th><th className="p-2 sm:p-3">MMR</th><th className="p-2 sm:p-3"><span className="sm:hidden">Vit.</span><span className="hidden sm:inline">Taxa de vit.</span></th><th className="hidden p-3 text-right sm:table-cell">Partidas</th></tr>
          </thead>
          <tbody>
            {data.map((p, i) => {
              const g = p.wins + p.losses;
              return (
                <tr key={p.id} className={`border-t border-border ${p.id === myId ? "bg-primary/10" : ""}`}>
                  <td className="p-2 sm:p-3"><span className={`grid h-7 w-7 place-items-center rounded font-bold ${i < 5 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{i + 1}</span></td>
                  <td className="max-w-0 p-2 sm:max-w-none sm:p-3"><Button variant="ghost" className="relative z-20 h-auto max-w-full justify-start gap-2 overflow-x-clip px-0 text-left sm:overflow-visible" onClick={() => setPlayerId(p.id)} aria-label={`Ver perfil de ${p.name}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-xs font-bold"><Avatar path={p.avatar_url} name={p.name} userId={p.id} /></span><EquippedEmblem userId={p.id} className="h-5 w-5" /><PlayerName userId={p.id} name={p.name} className="min-w-0 truncate font-semibold sm:max-w-72" /><span className="hidden sm:inline-flex"><StaffTag userId={p.id} className="ml-1" /></span></Button></td>
                  <td className="p-2 sm:p-3"><p className="font-bold">{p.rating}</p><div className="hidden sm:block"><RankBadge rating={p.rating} /></div></td>
                  <td className="p-2 sm:p-3"><p className="font-bold text-primary">{g ? ((p.wins / g) * 100).toFixed(1) : "0.0"}%</p><span className="text-[10px] text-muted-foreground">{p.wins}V - {p.losses}D</span></td>
                  <td className="hidden p-3 text-right sm:table-cell">{g}</td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Ninguém ranqueado ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </>}
      <PlayerProfileDialog playerId={playerId} onClose={() => setPlayerId(null)} />
    </main>
  );
}
