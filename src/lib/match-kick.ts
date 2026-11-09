export const KICK_VOTE_SECONDS = 20;
export function kickApproved(votes: boolean[]): boolean {
  return votes.filter(Boolean).length > votes.filter(v => !v).length;
}
/** "active" = players are voting; "pending_admin" = majority said yes, an admin must confirm before removal. */
export type MatchKickStatus = "active" | "pending_admin";
export interface MatchKick {
  id: string; status?: MatchKickStatus; targetId: string; targetName: string; endsAt: string;
  yes: number; no: number; myVote: boolean | null;
}
export interface PendingKick {
  id: string; matchId: string; matchStatus: string; targetId: string; targetName: string | null;
  startedByName: string | null; yes: number; no: number; endedAt: string;
}
