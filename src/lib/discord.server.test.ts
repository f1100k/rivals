import { afterEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
import { announceMatch, postRanking, publishResult } from "./discord.server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(error: { message: string } | null = null) {
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-key");
  vi.stubEnv("LOVABLE_API_KEY", "test-key");
  vi.stubEnv("DISCORD_API_KEY", "test-key");
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ error, data: { status: "completed", shot_score_a: null, shot_score_b: null,
      players: [{ team: "a", delta: -17, profiles: { name: "Jogador A" } }, { team: "b", delta: 18, profiles: { name: "Jogador B" } }] } })),
    limit: vi.fn(async () => ({ error: null, data: [] })),
  };
  createClientMock.mockReturnValue({ from: () => query });
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Discord match delivery", () => {
  it("sends the winner and lower-case team rosters to partidas", async () => {
    const fetchMock = setup();
    await announceMatch("match-id");
    expect(fetchMock).toHaveBeenCalledWith("https://connector-gateway.lovable.dev/discord/channels/1567373773001334978/messages", expect.any(Object));
    const payload = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(payload.embeds[0].title).toBe("🏆 Vitória do Time B");
    expect(payload.embeds[0].fields[0].value).toBe("Jogador A (-17)");
    expect(payload.embeds[0].fields[1].value).toBe("Jogador B (+18)");
  });
  it("surfaces database failures rather than silently skipping the result", async () => {
    setup({ message: "read failed" });
    await expect(announceMatch("match-id")).rejects.toThrow("read failed");
  });
  it("still attempts ranking delivery if match delivery fails", async () => {
    const fetchMock = setup({ message: "read failed" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await publishResult("match-id");
    expect(fetchMock).toHaveBeenCalledWith("https://connector-gateway.lovable.dev/discord/channels/1567382286712709150/messages", expect.any(Object));
  });
  it("edits the newest ranking message and deletes older ones instead of posting", async () => {
    const fetchMock = setup();
    const bot = { id: "1567379012471492668" };
    const emb = [{ title: "🏆 Ranking In-house — Top 10" }];
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify([
      { id: "new", author: bot, embeds: emb }, { id: "old", author: bot, embeds: emb },
    ]), { status: 200 }));
    await postRanking();
    const calls = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(([u, i]) => `${i.method} ${u.split("/channels/1567382286712709150")[1]}`);
    expect(calls).toEqual(["GET /messages?limit=50", "PATCH /messages/new", "DELETE /messages/old"]);
  });
});