import { describe, expect, it } from "vitest";
import { kickApproved, KICK_VOTE_SECONDS } from "./match-kick";
describe("match kick", () => {
  it("lasts exactly twenty seconds", () => expect(KICK_VOTE_SECONDS).toBe(20));
  it("approves simple majority of valid votes", () => expect(kickApproved([true, true, false])).toBe(true));
  it("retains player on tie", () => expect(kickApproved([true, false])).toBe(false));
  it("retains player with no votes", () => expect(kickApproved([])).toBe(false));
});