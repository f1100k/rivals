import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerStats, PlayerReputation } from "./PlayerProfile";
import type { PlayerProfile } from "@/lib/player-profile";
vi.mock("./ProfileTags", () => ({ EquippedProfileTag: () => null }));
vi.mock("./Emblems", () => ({ EquippedEmblem: () => null }));
vi.mock("./NameFonts", () => ({ PlayerName: ({ name }: { name: string }) => <>{name}</> }));

vi.mock("./Avatar", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name.slice(0, 1).toUpperCase()}</span>,
}));

const profile: PlayerProfile = {
  id: "u1",
  name: "ˢᵀᴺ ₓ Arroganti",
  avatar_url: null,
  rating: 90,
  wins: 12,
  losses: 7,
  primary_position: "Goleiro",
  secondary_position: "Pivô",
  stats: {
    games: 19, goals: 4, assists: 2, passes: 8, interceptions: 3,
    saves: 44, gk_saves: 44, gk_games: 9, mvps: 1, score: 0,
  },
};

describe("perfil do jogador", () => {
  it("mostra apenas Save/GK, sem a linha duplicada Defesas", () => {
    render(<PlayerStats profile={profile} />);

    expect(screen.queryByText("Defesas")).toBeNull();
    expect(screen.getByText("Save/GK")).toBeTruthy();
    expect(screen.getByText("Partidas no gol")).toBeTruthy();
    expect(screen.getByText("44")).toBeTruthy();
  });

  it("lista quem curtiu o jogador e a quantidade de curtidas", () => {
    render(<PlayerReputation profile={{
      ...profile,
      reputation: 2,
      likes: [
        { userId: "u2", name: "JVI", avatarUrl: "u2/avatar.png", at: "2026-11-05T20:00:00Z" },
        { userId: "u3", name: "Menzinho", avatarUrl: null, at: "2026-11-04T18:30:00Z" },
      ],
    }} />);

    expect(screen.getByText(/Curtidas/)).toBeTruthy();
    expect(screen.getByText("(2)")).toBeTruthy();
    expect(screen.getByText("JVI")).toBeTruthy();
    expect(screen.getByText("Menzinho")).toBeTruthy();
    expect(screen.queryByText("Ainda ninguém curtiu este jogador.")).toBeNull();
  });

  it("avisa quando o jogador ainda não recebeu curtidas", () => {
    render(<PlayerReputation profile={{ ...profile, reputation: 0, likes: [] }} />);

    expect(screen.getByText("Ainda ninguém curtiu este jogador.")).toBeTruthy();
  });
});
