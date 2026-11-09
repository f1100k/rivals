import { describe, expect, it, vi } from "vitest";
import { botRequest, closeVoteRequest } from "./admin-controls";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { addQueueBots, closeMatchVote } from "./admin-controls.functions";

describe("admin queue controls", () => {
  it("rejects bot creation when the authenticated user is not admin", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const run = addQueueBots as unknown as (input: unknown) => Promise<unknown>;
    await expect(run({ data: { count: 4, position: "Ala" }, context: { userId: "player", supabase: { rpc } } })).rejects.toThrow("Somente administradores");
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "player", _role: "admin" });
  });
  it("accepts goalkeeper and outfield test bots", () => {
    expect(botRequest.parse({ count: 4, position: "Goleiro" }).position).toBe("Goleiro");
    expect(botRequest.parse({ count: 4, position: "Ala" }).count).toBe(4);
    expect(botRequest.safeParse({ count: 0, position: "Ala" }).success).toBe(false);
  });
  it("requires an actual winning team and a reason", () => {
    expect(closeVoteRequest.safeParse({ match: "0f9483cc-665e-42bb-bdc7-f5e6914d3015", side: "c", reason: "teste" }).success).toBe(false);
    expect(closeVoteRequest.safeParse({ match: "0f9483cc-665e-42bb-bdc7-f5e6914d3015", side: "a", reason: " " }).success).toBe(false);
  });
  it("refuses a denied admin resolution without publishing a result", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "sem_permissao" } });
    const run = closeMatchVote as unknown as (input: unknown) => Promise<unknown>;
    await expect(run({ data: { match: "match", side: "a", reason: "teste" }, context: { supabase: { rpc } } })).rejects.toThrow("Somente administradores");
    expect(rpc).toHaveBeenCalledWith("admin_close_match_vote", { p_match: "match", p_side: "a", p_reason: "teste" });
  });
});