import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { StaffTag } from "@/components/StaffTag";
import { EquippedEmblem } from "@/components/Emblems";
import { PlayerName } from "@/components/NameFonts";
import { fetchStatLeaders, type StatLeader } from "@/lib/inhouse.functions";
import { fetchLeagueStatLeaders } from "@/lib/league";

export type StatKey = "goals" | "assists" | "passes" | "saves" | "interceptions" | "mvps" | "gk_saves";

export const STAT_BOARDS: { key: StatKey; title: string; unit: string }[] = [
  { key: "goals", title: "Artilharia", unit: "Gols" },
  { key: "gk_saves", title: "Save/GK", unit: "Saves" },
  { key: "interceptions", title: "Interceptação", unit: "Interceptações" },
  { key: "mvps", title: "MVP", unit: "MVPs" },
  { key: "passes", title: "Passes", unit: "Passes" },
  { key: "assists", title: "Assistência", unit: "Assistências" },
];

export function StatBoard({ stat, onPlayerSelect, season = null, league = null }: { stat: StatKey; onPlayerSelect: (id: string) => void; season?: string | null; league?: string | null }) {
  const fn = useServerFn(fetchStatLeaders);
  const { data = [] } = useQuery({
    queryKey: league ? ["league-stat-leaders", league] : ["stat-leaders", season ?? "atual"],
    queryFn: () => (league ? fetchLeagueStatLeaders(league) : fn({ data: { season } })),
    refetchInterval: 30000, refetchIntervalInBackground: false,
  });
  const board = STAT_BOARDS.find((b) => b.key === stat);
  if (!board) return null;
  const rows = [...data]
    .filter((p: StatLeader) => Number(p[stat]) > 0)
    .sort((x, y) => Number(y[stat]) - Number(x[stat]));
  return (
    <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="p-3">#</th><th className="p-3">Jogador</th><th className="p-3 text-right">{board.unit}</th><th className="p-3 text-right">Partidas</th></tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id} className="border-t border-border">
              <td className="p-3"><span className={`grid h-7 w-7 place-items-center rounded font-bold ${i < 3 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{i + 1}</span></td>
              <td className="p-3"><Button variant="ghost" className="h-auto justify-start gap-2 px-0 text-left" onClick={() => onPlayerSelect(p.id)} aria-label={`Ver perfil de ${p.name}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-xs font-bold"><Avatar path={p.avatar_url} name={p.name} userId={p.id} /></span><EquippedEmblem userId={p.id} className="h-5 w-5" /><PlayerName userId={p.id} name={p.name} className="max-w-72 truncate font-semibold" /><StaffTag userId={p.id} className="ml-1" /></Button></td>
              <td className="p-3 text-right font-display text-lg font-bold text-primary">{String(p[stat])}</td>
              <td className="p-3 text-right text-muted-foreground">{stat === "gk_saves" ? p.gk_games : p.games}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Ainda sem dados. Os números vêm dos prints enviados no fim das partidas.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
