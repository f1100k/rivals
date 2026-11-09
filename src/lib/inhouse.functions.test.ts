import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
const { cleanupMock } = vi.hoisted(() => ({ cleanupMock: vi.fn(async () => {}) }));
vi.mock("@/lib/match-voice.server", () => ({ cleanupFinishedVoiceSafely: cleanupMock }));

import { fetchRanking, getInhouseStateGk, voteMatchGk, voteCancelMatchGk } from "./inhouse.functions";

const readState = getInhouseStateGk as unknown as (input: {
  context: { supabase: { rpc: ReturnType<typeof vi.fn> } };
}) => Promise<unknown>;

describe("queue state synchronization", () => {
  it("waits for automatic picks before reading the teams", async () => {
    const rpc = vi.fn(async (name: string) => {
      expect(name).toBe("poll_inhouse_gk");
      return { data: { state: { match: { status: "room" } }, draft: { turn: "b", picksLeft: 2 } }, error: null };
    });
    await expect(readState({ context: { supabase: { rpc } } })).resolves.toEqual({
      match: { status: "room" }, draft: { turn: "b", picksLeft: 2 },
    });
  });

  it("does not silently ignore a failed draft update", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "draft failed" } });
    await expect(readState({ context: { supabase: { rpc } } })).rejects.toThrow("draft failed");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("ranking membership", () => {
  it("excludes ghost accounts before ordering and limiting the ranking", async () => {
    const profiles = [
      { id: "bot", is_ghost: true, rating: 2000 },
      { id: "real", is_ghost: false, rating: 1000 },
    ];
    let rows = profiles;
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((field: "is_ghost", value: boolean) => {
        rows = rows.filter((row) => row[field] === value);
        return query;
      }),
      or: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(async () => ({ data: rows, error: null })),
    };
    createClientMock.mockReturnValue({ from: () => query });
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubEnv("SUPABASE_URL", "https://example.invalid");
    try {
      const ranking = await (fetchRanking as unknown as (ctx: { data: { season: null } }) => Promise<{ id: string }[]>)({ data: { season: null } });
      expect(ranking.map((row) => row.id)).toEqual(["real"]);
      expect(query.eq).toHaveBeenCalledWith("is_ghost", false);
      // After a season reset only people who already played this season are listed.
      expect(query.or).toHaveBeenCalledWith("wins.gt.0,losses.gt.0");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("voice return after voting", () => {
  it.each(["voting", "completed"])("winner vote only triggers voice return when %s is terminal", async (status) => {
    cleanupMock.mockClear();
    const rpc = vi.fn(async () => ({ data: status, error: null }));
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: null }) };
    const run = voteMatchGk as unknown as (input: unknown) => Promise<unknown>;
    await run({ data: { side: "a" }, context: { userId: "player", supabase: { rpc, from: () => query } } });
    expect(cleanupMock).toHaveBeenCalledTimes(status === "completed" ? 1 : 0);
  });
  it.each(["voting", "cancelled"])("cancel vote only triggers voice return when %s is terminal", async (status) => {
    cleanupMock.mockClear();
    const rpc = vi.fn(async () => ({ data: status, error: null }));
    const run = voteCancelMatchGk as unknown as (input: unknown) => Promise<unknown>;
    await run({ context: { supabase: { rpc } } });
    expect(cleanupMock).toHaveBeenCalledTimes(status === "cancelled" ? 1 : 0);
  });
});