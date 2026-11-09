import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISCORD_APPLICATION, queuePanel } from "./discord-queue";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
import { cleanupFinishedQueueChannel } from "./discord-queue-cleanup.server";

const endedAt = "2026-11-04T04:52:45.000Z";
const snowflake = (date: string) => ((BigInt(Date.parse(date) - 1420070400000) << 22n) + 1n).toString();
const panelId = snowflake("2026-11-04T04:00:00Z");
const oldId = snowflake("2026-11-04T04:50:00Z");
const newId = snowflake("2026-11-04T04:53:00Z");

function setup(status = "completed", footer?: string, confirmStatus = status) {
  const read = { data: { id: "match-id", status, completed_at: endedAt }, error: null };
  const confirmed = { data: { status: confirmStatus, completed_at: endedAt }, error: null };
  mocks.from.mockReturnValue({ select: () => ({
    in: () => ({ not: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => read }) }) }) }),
    eq: () => ({ maybeSingle: async () => confirmed }),
  }) });
  const messages = [
    { id: newId, author: { id: "player" } },
    { id: oldId, author: { id: "player" } },
    { id: panelId, author: { id: DISCORD_APPLICATION }, ...queuePanel(), embeds: [{ footer: { text: footer } }] },
  ];
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "GET"
    ? Response.json(messages) : new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, messages };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LOVABLE_API_KEY", "test");
  vi.stubEnv("DISCORD_API_KEY", "test");
});

describe("Discord queue cleanup", () => {
  it.each(["draft", "room", "voting", "reporting", "disputed"])("never clears an open %s match", async (status) => {
    const { fetcher } = setup(status);
    await cleanupFinishedQueueChannel();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["completed", "cancelled"])("cleans %s messages but preserves the buttons and next match messages", async (status) => {
    const { fetcher } = setup(status);
    await cleanupFinishedQueueChannel();
    const deleted = fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(deleted.map(([url]) => url)).toEqual([expect.stringContaining(`/messages/${oldId}`)]);
    const patched = fetcher.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patched?.[0]).toContain(`/messages/${panelId}`);
    const payload = JSON.parse(String(patched?.[1]?.body));
    expect(payload.components).toEqual(queuePanel().components);
    expect(payload.embeds[0].footer.text).toBe("queue-cleaned:match-id");
  });
  it("does not repeat cleanup for the same ended match", async () => {
    const { fetcher } = setup("completed", "queue-cleaned:match-id");
    await cleanupFinishedQueueChannel();
    expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("refuses cleanup if the match is no longer confirmed ended", async () => {
    const { fetcher } = setup("completed", undefined, "voting");
    await cleanupFinishedQueueChannel();
    expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("never deletes anything when the trusted button panel is missing", async () => {
    const { fetcher, messages } = setup();
    messages.pop();
    await cleanupFinishedQueueChannel();
    expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("leaves cleanup pending when Discord denies message deletion", async () => {
    const { fetcher } = setup();
    fetcher.mockImplementation(async (_url, init) => init?.method === "GET"
      ? Response.json([{ id: oldId, author: { id: "player" } }, { id: panelId, author: { id: DISCORD_APPLICATION }, ...queuePanel() }])
      : new Response("Missing Permissions", { status: 403 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(cleanupFinishedQueueChannel()).rejects.toThrow("403");
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    log.mockRestore();
  });
});