import { describe, expect, it } from "vitest";
import { queueAction, queueInteraction, DISCORD_APPLICATION, DISCORD_GUILD, DISCORD_QUEUE_CHANNEL } from "./discord-queue";
import { verifyDiscordRequest } from "./discord-queue.server";

describe("Discord queue entry", () => {
  it.each(["Goleiro", "Pivô", "Ala", "Fixo"])("joins the shared queue as %s", (position) => {
    expect(queueAction(`queue:join:${position}`)).toEqual({ action: "join", position });
  });
  it("rejects unknown positions", () => { expect(queueAction("queue:join:Admin")).toBeNull(); });
  it("allows queue withdrawal and presence confirmation", () => {
    expect(queueAction("queue:leave")).toEqual({ action: "leave", position: null });
    expect(queueAction("queue:heartbeat")).toEqual({ action: "heartbeat", position: null });
  });
  it("rejects clicks outside the configured server and channel", () => {
    const input = { id: "1567379012471492669", application_id: DISCORD_APPLICATION, type: 3, token: "test-interaction", guild_id: DISCORD_GUILD, channel_id: DISCORD_QUEUE_CHANNEL, member: { user: { id: "1567379012471492670" } }, data: { component_type: 2, custom_id: "queue:join:Ala" } };
    expect(queueInteraction.safeParse(input).success).toBe(true);
    expect(queueInteraction.safeParse({ ...input, guild_id: "1567379012471492671" }).success).toBe(false);
    expect(queueInteraction.safeParse({ ...input, channel_id: "1567379012471492672" }).success).toBe(false);
  });
  it("rejects unsigned and forged requests", async () => {
    expect(await verifyDiscordRequest(new Request("https://example.invalid"), "{}")).toBe(false);
    const request = new Request("https://example.invalid", { headers: { "x-signature-ed25519": "0".repeat(128), "x-signature-timestamp": String(Math.floor(Date.now() / 1000)) } });
    expect(await verifyDiscordRequest(request, "{}")).toBe(false);
  });
});