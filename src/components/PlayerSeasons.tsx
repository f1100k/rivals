import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, CalendarDays, Medal, Trophy } from "lucide-react";
import { Button } from "./ui/button";
import { RankBadge } from "./RankBadge";
import { RewardTag } from "./ProfileTags";
import { EmblemImage, usePlayerEmblems, type SeasonEmblem } from "./Emblems";
import { PlayerStats } from "./PlayerProfile";
import type { PlayerProfile } from "@/lib/player-profile";
import { careerRecord, fetchPlayerSeasons, fmtDate, groupTagsBySeason, playerSeasonsKey, tagsOfSeason, type PlayerSeason, type SeasonTag } from "@/lib/seasons";

function SeasonStatsView({ season }: { season: PlayerSeason }) {
  const st = season.stats;
  const period = season.status === "active"
    ? `Em andamento desde ${fmtDate(season.started_at)}${season.planned_end ? ` · termina ${fmtDate(season.planned_end)}` : ""}`
    : `${fmtDate(season.started_at)} até ${fmtDate(season.finished_at)}`;
  if (!st) return <p className="mt-4 text-sm text-muted-foreground"><CalendarDays className="mr-1 inline h-4 w-4" />{period}. Não jogou nessa season.</p>;
  const games = st.wins + st.losses;
  const rows: [string, string | number][] = [
    ["Partidas", games], ["Vitórias", st.wins], ["Derrotas", st.losses],
    ["Taxa de vitória", `${games ? ((st.wins / games) * 100).toFixed(1) : "0.0"}%`],
    ["Gols", st.goals], ["Assistências", st.assists], ["Passes", st.passes], ["Interceptações", st.interceptions],
    ["Save/GK", st.gk_saves], ["Partidas no gol", st.gk_games], ["MVPs", st.mvps], ["Curtidas", st.likes],
  ];
  return <div className="mt-4">
    <p className="text-xs text-muted-foreground"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{period}</p>
    <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-primary/40 bg-primary/10 p-4">
      <Medal className="h-8 w-8 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{season.status === "active" ? "Posição agora" : "Terminou a season em"}</p>
        <p className="font-display text-2xl font-bold">{st.final_rank && games > 0 ? `${st.final_rank}º lugar` : "—"} <span className="text-base text-primary">{st.final_rating} MMR</span></p>
      </div>
      <RankBadge rating={st.final_rating} className="sm:ml-auto" />
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {rows.map(([label, value]) => <div key={label} className="border-b border-border/60 pb-3">
        <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
      </div>)}
    </dl>
  </div>;
}

const emblemsOfSeason = (emblems: SeasonEmblem[], season: string) => (season === "geral" ? emblems : emblems.filter((e) => e.season_id === season));

function Achievements({ tags, emblems, grouped }: { tags: SeasonTag[]; emblems: SeasonEmblem[]; grouped: boolean }) {
  if (!tags.length && !emblems.length) return <p className="mt-4 text-sm text-muted-foreground">Nenhuma conquista {grouped ? "ainda" : "nessa season"}.</p>;
  const groups = grouped ? groupTagsBySeason(tags) : [{ label: "", number: null, tags }];
  // Seasons that only have emblems still need their own group.
  if (grouped) for (const e of emblems) {
    const label = e.season_name ?? "Sem season";
    if (!groups.some((g) => g.label === label)) groups.push({ label, number: e.season_number, tags: [] });
  }
  if (grouped) groups.sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
  const emblemsOf = (label: string) => grouped ? emblems.filter((e) => (e.season_name ?? "Sem season") === label) : emblems;
  return <div className="mt-4 space-y-4">
    {groups.map((g) => <div key={g.label || "all"}>
      {grouped && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>}
      <ul className="flex flex-wrap gap-2" aria-label={grouped ? `Conquistas ${g.label}` : "Conquistas da season"}>
        {g.tags.map((t) => <li key={t.id} className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
          <Award className="h-3.5 w-3.5 text-primary" />
          <RewardTag name={t.name} textColor={t.text_color} backgroundColor={t.background_color} effect={t.effect} season={t.season_number} />
        </li>)}
        {emblemsOf(g.label).map((e) => <li key={`emblem-${e.id}`} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
          <EmblemImage path={e.image_path} name={e.name} season={e.season_number} className="h-7 w-7" />
          <span className="text-xs font-semibold">{e.name}{e.season_number !== null ? ` · S${e.season_number}` : ""}</span>
        </li>)}
      </ul>
    </div>)}
  </div>;
}

/** Profile statistics with a season picker (Geral / each season) and a per-season achievements view. */
export function PlayerSeasons({ profile }: { profile: PlayerProfile }) {
  const { data } = useQuery({ queryKey: playerSeasonsKey(profile.id), queryFn: () => fetchPlayerSeasons(profile.id), staleTime: 30000 });
  const [picked, setSeason] = useState<string | null>(null);
  const [view, setView] = useState<"stats" | "achievements">("stats");
  const seasons = data?.seasons ?? [];
  // Opens on the season running now; "Geral" sums every season.
  const season = picked ?? seasons.find((s) => s.status === "active")?.id ?? "geral";
  const career = careerRecord(profile, seasons);
  const tags = data?.tags ?? [];
  const { data: emblems = [] } = usePlayerEmblems(profile.id);
  const current = seasons.find((s) => s.id === season);
  const chip = (active: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`;

  return <section className="mt-6 border-t border-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Trophy className="h-4 w-4 text-primary" /> Temporadas</h3>
      <div className="flex rounded-full border border-border p-0.5" role="tablist" aria-label="O que ver">
        <Button type="button" size="sm" role="tab" aria-selected={view === "stats"} variant={view === "stats" ? "default" : "ghost"} className="h-7 rounded-full px-3 text-xs" onClick={() => setView("stats")}>Estatísticas</Button>
        <Button type="button" size="sm" role="tab" aria-selected={view === "achievements"} variant={view === "achievements" ? "default" : "ghost"} className="h-7 rounded-full px-3 text-xs" onClick={() => setView("achievements")}>Conquistas ({tagsOfSeason(tags, season).length + emblemsOfSeason(emblems, season).length})</Button>
      </div>
    </div>
    <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" aria-label="Escolher season">
      <Button type="button" variant="outline" className={chip(season === "geral")} onClick={() => setSeason("geral")}>Geral</Button>
      {seasons.map((s) => <Button key={s.id} type="button" variant="outline" className={chip(season === s.id)} onClick={() => setSeason(s.id)}>
        {s.name}{s.status === "active" ? " · agora" : ""}
      </Button>)}
    </div>
    {view === "achievements"
      ? <Achievements tags={tagsOfSeason(tags, season)} emblems={emblemsOfSeason(emblems, season)} grouped={season === "geral"} />
      : current ? <SeasonStatsView season={current} /> : <>
        <p className="mt-4 text-xs text-muted-foreground">Somando todas as seasons. MMR atual: <span className="font-semibold text-foreground">{profile.rating}</span></p>
        <PlayerStats profile={{ ...profile, ...career }} bare />
      </>}
  </section>;
}
