import { supabase } from "@/integrations/supabase/client";

export type MixState = { active: boolean; manualOn: boolean; startsAt: string | null; endsAt: string | null };
export type MixRow = { id: string; name: string; avatar_url: string | null; rating: number; wins: number; losses: number; balance: number };

export const MIX_STATE_KEY = ["mix-state"] as const;
export const MIX_RANKING_KEY = ["mix-ranking"] as const;
export const MIX_MVP_KEY = ["mix-mvp-ranking"] as const;
export type MixMvpRow = { id: string; name: string; avatar_url: string | null; mvps: number; games: number };

/** Most MVPs first; ties go to whoever needed fewer Mix games, then name. Players without MVP are left out. */
export function sortMixMvpRows<T extends { name: string; mvps: number; games: number }>(rows: T[]) {
  return rows.filter((r) => r.mvps > 0).sort((x, y) => y.mvps - x.mvps || x.games - y.games || x.name.localeCompare(y.name, "pt-BR"));
}

/** Mix ranking score: every loss cancels one win. */
export function mixBalance(wins: number, losses: number) {
  return wins - losses;
}

/** Highest balance first; ties go to more wins, then fewer losses, then name. */
export function sortMixRows<T extends { name: string; wins: number; losses: number }>(rows: T[]) {
  return [...rows].sort((x, y) =>
    mixBalance(y.wins, y.losses) - mixBalance(x.wins, x.losses) || y.wins - x.wins || x.losses - y.losses || x.name.localeCompare(y.name, "pt-BR"));
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dayHhmm = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Short status line for the Mix, or null when nothing is on or scheduled. */
export function mixStatusText(s: MixState | null | undefined, now = Date.now()): string | null {
  if (!s) return null;
  const start = s.startsAt ? new Date(s.startsAt).getTime() : null;
  const end = s.endsAt ? new Date(s.endsAt).getTime() : null;
  if (s.manualOn) return "Modo Mix ativo";
  if (start !== null && end !== null && now >= start && now < end) return `Modo Mix ativo até ${hhmm(s.endsAt!)}`;
  if (start !== null && end !== null && now < start) return `Modo Mix começa ${dayHhmm(s.startsAt!)} e vai até ${hhmm(s.endsAt!)}`;
  return null;
}

export async function fetchMixState(): Promise<MixState> {
  const { data, error } = await supabase.rpc("get_mix_state");
  if (error) throw error;
  return data as unknown as MixState;
}

/** `season` null = the season running now. */
export async function fetchMixRanking(season: string | null = null): Promise<MixRow[]> {
  const { data, error } = await supabase.rpc("get_mix_ranking", season ? { p_season: season } : {});
  if (error) throw error;
  return sortMixRows((data as unknown as MixRow[]) ?? []);
}

export async function fetchMixMvpRanking(season: string | null = null): Promise<MixMvpRow[]> {
  const { data, error } = await supabase.rpc("get_mix_mvp_ranking", season ? { p_season: season } : {});
  if (error) throw error;
  return sortMixMvpRows((data as unknown as MixMvpRow[]) ?? []);
}
