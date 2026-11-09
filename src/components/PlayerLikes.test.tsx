import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PlayerLikes, MatchLikes, isWithinLikeWindow } from "./PlayerLikes";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), like: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/player-likes.functions", () => ({ getMyLikeMatches: mocks.fetch, likePlayer: mocks.like }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.like.mockReset();
});

describe("post-match likes", () => {
  it("only offers likes for the latest match, never older matches", async () => {
    mocks.fetch.mockResolvedValue([
      { id: "current", completedAt: minutesAgo(5), players: [{ userId: "current-player", name: "Atual", liked: false }] },
      { id: "older", completedAt: minutesAgo(40), players: [{ userId: "older-player", name: "Anterior", liked: false }] },
    ]);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlayerLikes /></QueryClientProvider>);
    const button = await screen.findByRole("button", { name: "Curtir Atual" });
    expect(screen.queryByRole("button", { name: "Curtir Anterior" })).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.like).toHaveBeenCalledWith({ data: { matchId: "current", targetId: "current-player" } }));
  });
  it("sends the real match and teammate IDs and prevents a second like after readback", async () => {
    const matchId = "684f060a-a703-47a7-aa09-b8b03860c442";
    const targetId = "4d86d28a-0000-4000-8000-123456789012";
    let saved = false;
    mocks.fetch.mockImplementation(async () => [{ id: matchId, completedAt: minutesAgo(2), players: [{ userId: targetId, name: "Companheiro", liked: saved }] }]);
    mocks.like.mockImplementation(async () => { saved = true; return true; });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlayerLikes /></QueryClientProvider>);
    const like = await screen.findByRole("button", { name: "Curtir Companheiro" });
    fireEvent.click(like);
    await waitFor(() => expect(mocks.like).toHaveBeenCalledWith({ data: { matchId, targetId } }));
    await waitFor(() => expect(like).toBeDisabled());
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    fireEvent.click(like);
    expect(mocks.like).toHaveBeenCalledTimes(1);
  });
  it("hides the last-match likes once the 30-minute window has passed", async () => {
    mocks.fetch.mockResolvedValue([{ id: "old", completedAt: minutesAgo(31), players: [{ userId: "p", name: "Velho", liked: false }] }]);
    const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlayerLikes /></QueryClientProvider>);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

describe("like window", () => {
  it("keeps likes open for 30 minutes after the match ends", () => {
    const now = Date.parse("2026-11-07T21:00:00Z");
    expect(isWithinLikeWindow("2026-11-07T20:30:00Z", now)).toBe(true);
    expect(isWithinLikeWindow("2026-11-07T20:29:59Z", now)).toBe(false);
    expect(isWithinLikeWindow(null, now)).toBe(false);
  });
});

describe("likes during the match result screen", () => {
  it("lets a player like a teammate before the match is finalized and marks earlier likes", async () => {
    rpc.mockResolvedValue({ data: ["already"], error: null });
    mocks.like.mockResolvedValue(true);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MatchLikes matchId="m1" teammates={[{ userId: "t1", name: "Parceiro" }, { userId: "already", name: "Antigo" }]} /></QueryClientProvider>);
    const like = await screen.findByRole("button", { name: "Curtir Parceiro" });
    await waitFor(() => expect(like).toBeEnabled());
    expect(screen.getByRole("button", { name: "Curtir Antigo" })).toBeDisabled();
    fireEvent.click(like);
    await waitFor(() => expect(mocks.like).toHaveBeenCalledWith({ data: { matchId: "m1", targetId: "t1" } }));
  });
});
