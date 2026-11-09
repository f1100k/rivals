import { supabase } from "@/integrations/supabase/client";
import type { StatLeader } from "@/lib/inhouse.functions";

export type LeagueEvent = {
  id: string; name: string; starts_at: string; ends_at: string; min_games: number;
  status: "active" | "finished"; finished_at: string | null;
};
export type LeagueRow = {
  id: string; name: string; avatar_url: string | null; games: number; wins: number; losses: number;
  mmr_gain: number; qualified: boolean; place: number | null;
};
export type LeagueRanking = { event: LeagueEvent | null; rows: LeagueRow[] };

export const LEAGUE_EVENTS_KEY = ["league-events"] as const;
export const DEFAULT_MIN_GAMES = 15;

/** A player enters the Rivals League ranking once they reach the event's minimum games. */
export const isQualified = (games: number, min: number) => games >= min;
export const gamesMissing = (games: number, min: number) => Math.max(0, min - games);

/** Qualified players (already ordered by place) and the ones still chasing the minimum. */
export function splitLeague(rows: LeagueRow[]) {
  return { qualified: rows.filter((r) => r.qualified), pending: rows.filter((r) => !r.qualified) };
}

export const fmtGain = (n: number) => (n > 0 ? `+${n}` : String(n));

const day = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
/** "09/11 a 15/11": the end is exclusive (Sunday midnight), so show the last day played. */
export function leagueRangeLabel(e: Pick<LeagueEvent, "starts_at" | "ends_at">) {
  return `${day(new Date(e.starts_at))} a ${day(new Date(new Date(e.ends_at).getTime() - 1))}`;
}

/** <input type="date"> (Brasília) → start of that day / start of the day after (end is exclusive). */
export const dayStart = (v: string) => new Date(`${v}T00:00:00-03:00`).toISOString();
export const dayEndExclusive = (v: string) => new Date(new Date(`${v}T00:00:00-03:00`).getTime() + 86400000).toISOString();

/** Next Monday → Sunday (Brasília) as date-input values; today if it is Monday. */
export function nextWeekDates(now = new Date()) {
  const br = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const offset = (8 - br.getDay()) % 7; // 0 when Monday
  const mon = new Date(br.getFullYear(), br.getMonth(), br.getDate() + offset);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(mon), end: iso(sun) };
}

export async function fetchLeagueEvents(): Promise<LeagueEvent[]> {
  const { data, error } = await supabase.rpc("get_league_events");
  if (error) throw error;
  return (data as unknown as LeagueEvent[]) ?? [];
}

export async function fetchLeagueRanking(id: string): Promise<LeagueRanking> {
  const { data, error } = await supabase.rpc("get_league_ranking", { p_event: id });
  if (error) throw error;
  return (data as unknown as LeagueRanking) ?? { event: null, rows: [] };
}

export async function fetchLeagueStatLeaders(id: string): Promise<StatLeader[]> {
  const { data, error } = await supabase.rpc("get_league_stat_leaders", { p_event: id });
  if (error) throw error;
  return (data as unknown as StatLeader[]) ?? [];
}

const ERRORS: Record<string, string> = {
  sem_permissao: "Apenas admins podem mexer na Rivals League.",
  nome_invalido: "Dê um nome para o evento.",
  fim_antes_do_inicio: "O fim precisa ser depois do início.",
  minimo_invalido: "O mínimo de partidas precisa ser entre 1 e 200.",
  evento_finalizado: "Esse evento já foi finalizado.",
  evento_inexistente: "Evento não encontrado.",
};
export function leagueError(e: unknown) {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? m;
}
