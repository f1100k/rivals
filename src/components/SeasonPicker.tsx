import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEASONS_KEY, fetchSeasons, viewableSeasons } from "@/lib/seasons";
import { LEAGUE_EVENTS_KEY, fetchLeagueEvents, leagueRangeLabel } from "@/lib/league";

/** What a ranking page is showing: a season (null = the one running now) or a Rivals League event. */
export type RankingView = { kind: "season"; id: string | null } | { kind: "league"; id: string };

const encode = (v: RankingView) => (v.kind === "league" ? `l:${v.id}` : `s:${v.id ?? "atual"}`);
const decode = (s: string): RankingView =>
  s.startsWith("l:") ? { kind: "league", id: s.slice(2) } : { kind: "season", id: s === "s:atual" ? null : s.slice(2) };

/** Dropdown box with the seasons and, optionally, the Rivals League events. */
export function RankingViewPicker({ value, onChange, withLeague = false, className = "" }: {
  value: RankingView; onChange: (v: RankingView) => void; withLeague?: boolean; className?: string;
}) {
  const { data = [] } = useQuery({ queryKey: SEASONS_KEY, queryFn: fetchSeasons, staleTime: 60000 });
  const { data: events = [] } = useQuery({ queryKey: LEAGUE_EVENTS_KEY, queryFn: fetchLeagueEvents, staleTime: 60000, enabled: withLeague });
  const seasons = viewableSeasons(data);
  const leagues = withLeague ? events : [];
  if (seasons.length === 0 && leagues.length === 0) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Select value={encode(value)} onValueChange={(s) => onChange(decode(s))}>
        <SelectTrigger className="h-9 w-full max-w-xs bg-card font-semibold" aria-label="Escolher o que ver">
          <SelectValue placeholder="Escolher" />
        </SelectTrigger>
        <SelectContent>
          {seasons.length > 0 && (
            <SelectGroup>
              <SelectLabel>Seasons</SelectLabel>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={s.status === "active" ? "s:atual" : `s:${s.id}`}>
                  {s.name}{s.status === "active" ? " · agora" : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {leagues.length > 0 && <>
            {seasons.length > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>Rivals League</SelectLabel>
              {leagues.map((e) => (
                <SelectItem key={e.id} value={`l:${e.id}`}>
                  {e.name} · {leagueRangeLabel(e)}{e.status === "active" && Date.now() < new Date(e.ends_at).getTime() ? " · ao vivo" : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </>}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Season-only dropdown for match lists. `value` null = the season running now. */
export function SeasonPicker({ value, onChange, className = "" }: { value: string | null; onChange: (season: string | null) => void; className?: string }) {
  return (
    <RankingViewPicker className={className} value={{ kind: "season", id: value }}
      onChange={(v) => { if (v.kind === "season") onChange(v.id); }} />
  );
}
