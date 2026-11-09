import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PickGroup, MatchStage, TeamColumn, CompletedMatchResult, QueueRoster } from "./queue";
import { matchOdds, teamRole } from "@/lib/inhouse";
import type { GkMatch, GkMatchPlayer } from "@/lib/inhouse.functions";

function poolPlayer(name: string, position: GkMatchPlayer["position"]): GkMatchPlayer {
  return {
    userId: `pool-${name}`,
    name,
    avatarUrl: null,
    rating: 500,
    position,
    primaryPosition: position,
    secondaryPosition: null,
    team: null,
    vote: null,
    cancelVote: false,
    confirm: null,
    isMe: false,
    isCaptain: false,
  };
}

describe("pick groups", () => {
  it("opens the keeper group for the captain while keepers are being chosen", () => {
    wrap(
      <PickGroup
        title="Goleiros"
        icon={null}
        players={[poolPlayer("Zé", "Goleiro")]}
        active
        canPick
        onPick={() => {}}
      />,
    );
    expect(screen.getByText("Escolha agora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher Zé" })).toBeEnabled();
  });

  it("hands the chosen keeper to the captain who clicked him", () => {
    const onPick = vi.fn();
    wrap(
      <PickGroup
        title="Goleiros"
        icon={null}
        players={[poolPlayer("Zé", "Goleiro")]}
        active
        canPick
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Escolher Zé" }));
    expect(onPick).toHaveBeenCalledWith("pool-Zé");
  });

  it("locks the lines until both keepers are chosen", () => {
    wrap(
      <PickGroup
        title="Linhas"
        icon={null}
        players={[poolPlayer("Ana", "Pivô")]}
        active={false}
        canPick
        onPick={() => {}}
      />,
    );
    expect(screen.queryByText("Escolha agora")).toBeNull();
    expect(screen.getByRole("button", { name: "Escolher Ana" })).toBeDisabled();
  });

  it("locks every pick for a player who is not the captain on turn", () => {
    wrap(
      <PickGroup
        title="Linhas"
        icon={null}
        players={[poolPlayer("Ana", "Pivô")]}
        active
        canPick={false}
        onPick={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Escolher Ana" })).toBeDisabled();
  });
});

function draftMatch(phase: "gk" | "line") {
  const capA: GkMatchPlayer = { ...poolPlayer("Capitão A", "Pivô"), userId: "cap-a", team: "a", isMe: true, isCaptain: true };
  const capB: GkMatchPlayer = { ...poolPlayer("Capitão B", "Pivô"), userId: "cap-b", team: "b", isCaptain: true };
  const gk1: GkMatchPlayer = { ...poolPlayer("Goleiro Um", "Goleiro"), userId: "gk-1", team: phase === "line" ? "a" : null };
  const gk2: GkMatchPlayer = { ...poolPlayer("Goleiro Dois", "Goleiro"), userId: "gk-2", team: phase === "line" ? "b" : null };
  const l1: GkMatchPlayer = { ...poolPlayer("Linha Um", "Pivô"), userId: "l-1" };
  const l2: GkMatchPlayer = { ...poolPlayer("Linha Dois", "Ala"), userId: "l-2" };
  const m: GkMatch = {
    id: "m1",
    status: "draft",
    reportA: null,
    reportB: null,
    reportedBy: null,
    roomCode: null,
    createdAt: new Date().toISOString(),
    captainA: "cap-a",
    captainB: "cap-b",
    players: [capA, capB, gk1, gk2, l1, l2],
  };
  return { m, draft: { deadline: null, turn: "a" as const, picksLeft: 1, phase } };
}

function stage(phase: "gk" | "line") {
  const { m, draft } = draftMatch(phase);
  return wrap(
    <MatchStage
      draft={draft}
      m={m}
      onPick={() => {}}
      onSaveCode={async () => true}
      onVote={async () => true}
      onCancel={async () => true}
      onWithdraw={async () => true}
    />,
  );
}

describe("draft screen", () => {
  it("opens the keeper group first and keeps the lines locked", () => {
    stage("gk");
    expect(screen.getByText("Escolha um goleiro para o seu time. Se o tempo acabar, o sorteio escolhe por você.")).toBeInTheDocument();
    expect(screen.getByText("Goleiros")).toBeInTheDocument();
    expect(screen.getByText("Escolha agora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher Goleiro Um" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Escolher Linha Um" })).toBeDisabled();
  });

  it("hands the lines to the captains once both keepers are chosen", () => {
    stage("line");
    expect(screen.getByText("Escolha um jogador de linha para o seu time. Se o tempo acabar, o sorteio escolhe por você.")).toBeInTheDocument();
    expect(screen.queryByText("Goleiros")).toBeNull();
    expect(screen.getByText("Escolha agora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher Linha Um" })).toBeEnabled();
  });
});

function player(name: string, rating: number, team: "a" | "b"): GkMatchPlayer {
  return {
    userId: `${team}-${name}`,
    name,
    avatarUrl: null,
    rating,
    position: team === "a" ? "Goleiro" : "Pivô",
    primaryPosition: "Pivô",
    secondaryPosition: null,
    team,
    vote: null,
    cancelVote: false,
    confirm: null,
    isMe: false,
    isCaptain: false,
  };
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const fiveA = [300, 250, 200, 150, 100].map((r, i) => player(`a${i}`, r, "a"));
const fiveB = [280, 240, 190, 140, 90].map((r, i) => player(`b${i}`, r, "b"));
const odds = matchOdds(fiveA.map((p) => p.rating), fiveB.map((p) => p.rating));

describe("team cards", () => {
  it("labels the higher-MMR side Favorito with its total", () => {
    wrap(
      <TeamColumn
        side="a"
        players={fiveA}
        total={odds.totalA}
        role={teamRole("a", odds.favorite)}
        margin={odds.margin}
        prob={odds.probA}
      />,
    );
    expect(screen.getByText("Favorito")).toBeInTheDocument();
    expect(screen.queryByText("Desafiador")).toBeNull();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText("+60 MMR de vantagem")).toBeInTheDocument();
  });

  it("labels the lower-MMR side Desafiador", () => {
    wrap(
      <TeamColumn
        side="b"
        players={fiveB}
        total={odds.totalB}
        role={teamRole("b", odds.favorite)}
        margin={odds.margin}
        prob={odds.probB}
      />,
    );
    expect(screen.getByText("Desafiador")).toBeInTheDocument();
    expect(screen.queryByText("Favorito")).toBeNull();
    expect(screen.getByText("940")).toBeInTheDocument();
  });

  it("shows no label while the draft is still open", () => {
    const open = matchOdds(fiveA.slice(0, 2).map((p) => p.rating), fiveB.slice(0, 3).map((p) => p.rating));
    wrap(
      <TeamColumn
        side="a"
        players={fiveA.slice(0, 2)}
        total={open.totalA}
        role={teamRole("a", open.favorite)}
        margin={open.margin}
        prob={open.probA}
      />,
    );
    expect(screen.queryByText("Favorito")).toBeNull();
    expect(screen.queryByText("Desafiador")).toBeNull();
    expect(screen.queryByText(/de vitória/)).toBeNull();
  });

  it("shows each side's win chance once the draft is closed", () => {
    wrap(
      <TeamColumn
        side="a"
        players={fiveA}
        total={odds.totalA}
        role={teamRole("a", odds.favorite)}
        margin={odds.margin}
        prob={odds.probA}
      />,
    );
    // 200 average against 188: the favorite is favoured but far from certain.
    expect(screen.getByText("52% de vitória")).toBeInTheDocument();
  });

  it("marks the player who captains the team", () => {
    const capped = fiveA.map((p, i) => (i === 0 ? { ...p, isCaptain: true } : p));
    wrap(
      <TeamColumn
        side="a"
        players={capped}
        total={odds.totalA}
        role={teamRole("a", odds.favorite)}
        margin={odds.margin}
        prob={odds.probA}
      />,
    );
    expect(screen.getByText("Capitão")).toBeInTheDocument();
  });
});

describe("completed-match results", () => {
  it("keeps all ten participants available after the active match disappears", () => {
    wrap(<CompletedMatchResult result={{ scoreA: 3, scoreB: 1, players: [...fiveA, ...fiveB].map(p => ({ name: p.name, team: p.team ?? "a", delta: p.team === "a" ? 18 : -19, elo: null, bonus: null, before: null, after: null })) }} />);
    for (const p of [...fiveA, ...fiveB]) expect(screen.getByText(p.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resultado" }));
    expect(screen.getAllByText("+18 MMR")).toHaveLength(5);
    expect(screen.getAllByText("-19 MMR")).toHaveLength(5);
  });
});

describe("queue roster under Sair da fila", () => {
  it("lists everyone waiting with GK or Linha", () => {
    wrap(
      <QueueRoster
        players={[
          { userId: "u1", name: "Zé", avatarUrl: null, rating: 300, position: "Goleiro", joinedAt: "2026-11-08T02:00:00Z", isMe: false },
          { userId: "u2", name: "Lia", avatarUrl: null, rating: 200, position: "Ala", joinedAt: "2026-11-08T02:01:00Z", isMe: true },
        ]}
      />,
    );
    expect(screen.getByText("Na fila agora · 2")).toBeInTheDocument();
    expect(screen.getByText("Zé").closest("li")).toHaveTextContent("GK");
    expect(screen.getByText("Lia").closest("li")).toHaveTextContent("Linha");
  });
});
