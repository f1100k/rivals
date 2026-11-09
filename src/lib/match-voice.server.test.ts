import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), move: vi.fn(), voice: vi.fn(), remove: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("./discord-queue-cleanup.server", () => ({ cleanupFinishedQueueChannel: vi.fn() }));
vi.mock("./discord-voice.server", () => ({
  WAITING_ROOM: "waiting", moveMember: mocks.move, voiceChannelOf: mocks.voice,
  deleteChannel: mocks.remove, createVoiceChannel: vi.fn(),
}));
import { cleanupFinishedVoice } from "./match-voice.server";

function setup(status: string) {
  const marked = vi.fn(async () => ({ error: null, data: [{ match_id: "match" }] }));
  const released = vi.fn(async () => ({ error: null }));
  mocks.from.mockImplementation((table: string) => {
    if (table === "match_voice") return {
      select: () => ({ is: async () => ({ error: null, data: [{ match_id: "match", channel_a: "a", channel_b: "b", created_at: "2020-01-01", matches: { status } }] }) }),
      update: (v: { cleaned_at: string | null }) => ({ eq: () => (v.cleaned_at === null ? { eq: released } : { is: () => ({ select: marked }) }) }),
    };
    if (table === "match_players") return { select: () => ({ eq: async () => ({ data: [{ user_id: "player", team: "A" }], error: null }) }) };
    return { select: () => ({ in: async () => ({ data: [{ user_id: "player", discord_id: "discord-player" }], error: null }) }) };
  });
  mocks.voice.mockResolvedValue("a");
  return Object.assign(marked, { released });
}

beforeEach(() => { vi.resetAllMocks(); });

describe("match voice cleanup", () => {
  it.each(["draft", "room", "voting", "reporting", "disputed", "ready"])("keeps %s calls open even after six hours", async (status) => {
    const marked = setup(status);
    await cleanupFinishedVoice();
    expect(mocks.move).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(marked).not.toHaveBeenCalled();
  });
  it.each(["completed", "cancelled"])("returns players before closing %s calls", async (status) => {
    const marked = setup(status);
    await cleanupFinishedVoice();
    expect(mocks.move).toHaveBeenCalledWith("discord-player", "waiting");
    expect(mocks.remove.mock.calls).toEqual([["a"], ["b"]]);
    const movedAt = mocks.move.mock.invocationCallOrder[0];
    const removedAt = mocks.remove.mock.invocationCallOrder[0];
    if (movedAt === undefined || removedAt === undefined) throw new Error("Expected move and delete calls");
    expect(movedAt).toBeLessThan(removedAt);
    expect(marked).toHaveBeenCalled();
  });
  it("keeps calls for retry when returning a player fails", async () => {
    const marked = setup("completed");
    mocks.move.mockRejectedValue(new Error("move denied"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await cleanupFinishedVoice();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(marked.released).toHaveBeenCalled();
    log.mockRestore();
  });
  it("does not move someone who already left the team call", async () => {
    setup("completed");
    mocks.voice.mockResolvedValue("another-call");
    await cleanupFinishedVoice();
    expect(mocks.move).not.toHaveBeenCalled();
  });
});