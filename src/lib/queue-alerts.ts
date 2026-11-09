export type QueueAlert = "searching" | "player-joined" | "matched" | "draft-complete";
export interface QueueAlertState {
  queued: boolean;
  matchId: string | null;
  status: string | null;
  queueCount: number;
}
export function queueAlerts(previous: QueueAlertState | null, current: QueueAlertState): QueueAlert[] {
  if (!previous) return [];
  if (current.matchId && current.matchId !== previous.matchId) {
    return current.status === "draft" ? ["matched"] : ["matched", "draft-complete"];
  }
  if (current.matchId && previous.status === "draft" && current.status !== "draft") return ["draft-complete"];
  if (!previous.queued && current.queued) return ["searching"];
  // Someone else joined while we are already queued and no match formed yet.
  if (previous.queued && current.queued && !current.matchId && current.queueCount > previous.queueCount) {
    return ["player-joined"];
  }
  return [];
}
