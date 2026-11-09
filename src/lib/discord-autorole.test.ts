import { describe, expect, it } from "vitest";
import {
  MEMBER_ROLE_ID,
  memberNeedsRole,
  membersMissingRole,
} from "./discord-autorole";

describe("memberNeedsRole", () => {
  it("wants Membro for a human without it", () => {
    expect(memberNeedsRole({ user: { id: "1" }, roles: [] })).toBe(true);
  });
  it("is satisfied once the human has Membro", () => {
    expect(memberNeedsRole({ user: { id: "2" }, roles: [MEMBER_ROLE_ID] })).toBe(false);
  });
  it("leaves bots and pending people alone", () => {
    expect(memberNeedsRole({ user: { id: "3", bot: true }, roles: [] })).toBe(false);
    expect(memberNeedsRole({ user: { id: "4" }, roles: [], pending: true })).toBe(false);
  });
  it("treats a member with no role list as needing it", () => {
    expect(memberNeedsRole({ user: { id: "5" } })).toBe(true);
  });
});

describe("membersMissingRole", () => {
  it("gives Membro only to humans without it", () => {
    expect(
      membersMissingRole([
        { user: { id: "1" }, roles: [] },
        { user: { id: "2" }, roles: [MEMBER_ROLE_ID] },
        { user: { id: "3", bot: true }, roles: [] },
        { user: { id: "4" }, roles: [], pending: true },
      ]),
    ).toEqual(["1"]);
  });
});
