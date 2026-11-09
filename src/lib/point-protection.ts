export const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
export const TROLLING_EXTRA = -9;
export function namedTier(rating: number) { return Math.min(5, Math.floor(Math.max(0, rating) / 300)); }
export function rankActivators(highestTier: number, rating: number) { return Math.max(0, namedTier(rating) - highestTier); }
export function dailyRefresh(available: boolean, nextAt: number, now: number) {
  if (now < nextAt) return { available, nextAt, granted: 0 };
  const periods = Math.floor((now - nextAt) / DAILY_REFRESH_MS) + 1;
  return { available: true, nextAt: nextAt + periods * DAILY_REFRESH_MS, granted: available ? 0 : 1 };
}
export interface ProtectionResult {
  matchId: string; completedAt: string; before: number; after: number; baseDelta: number; delta: number;
  averageA: number; averageB: number; protectionKind: 'daily' | 'rank' | null; trollingDelta: number; blockedReason: string | null;
}
export interface ProtectionState {
  dailyAvailable: boolean; dailyNextAt: string; rankStock: number; result: ProtectionResult | null;
  history: { event: string; category: string | null; points: number; stockChange: number; matchId: string | null; createdAt: string }[];
}