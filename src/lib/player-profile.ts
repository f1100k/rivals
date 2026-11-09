import type { GamePosition } from "./inhouse.functions";

const positions = ["Goleiro", "Pivô", "Ala", "Fixo"];

export interface PlayerLike { userId: string; name: string; avatarUrl: string | null; at: string; count?: number }

export interface PlayerProfile {
  id: string; name: string; avatar_url: string | null; rating: number; wins: number; losses: number; reputation?: number;
  likes?: PlayerLike[];
  banner_url?: string | null;
  primary_position: GamePosition | null; secondary_position: GamePosition | null;
  stats: { games: number; goals: number; assists: number; passes: number; interceptions: number; saves: number; gk_saves: number; gk_games: number; mvps: number; score: number };
}

export function validatePositions(input: { primary: string | null; secondary: string | null }) {
  // Report a position that isn't part of the inhouse set before asking for the missing one.
  for (const position of [input.primary, input.secondary]) {
    if (position !== null && !positions.includes(position)) throw new Error("Posição inválida.");
  }
  if (!input.primary || !input.secondary) throw new Error("Escolha suas duas posições.");
  if (input.primary === input.secondary) throw new Error("Escolha posições diferentes.");
  return { primary: input.primary as GamePosition | null, secondary: input.secondary as GamePosition | null };
}

export function needsPositionReminder(profile: Pick<PlayerProfile, "primary_position" | "secondary_position">) {
  return !profile.primary_position || !profile.secondary_position;
}