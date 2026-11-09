import { describe, expect, it } from "vitest";
import { blocksMatchNavigation, mustStayInMatch } from "./active-match";

describe("current match lock", () => {
  it.each(["draft", "room", "voting", "reporting", "disputed"])("lets admins leave and return during %s without releasing the match", (status) => {
    for (const path of ["/admin", "/inicio", "/ranking", "/partidas", "/perfil", "/queue"]) {
      expect(blocksMatchNavigation(status, path, true)).toBe(false);
    }
    expect(mustStayInMatch(status)).toBe(true);
    expect(blocksMatchNavigation(status, "/admin", false)).toBe(true);
  });
  it.each(["draft", "room", "voting", "reporting", "disputed"])("keeps a %s participant in the current match", (status) => {
    expect(mustStayInMatch(status)).toBe(true);
    for (const path of ["/inicio", "/ranking", "/partidas", "/perfil"]) {
      expect(blocksMatchNavigation(status, path)).toBe(true);
    }
    expect(blocksMatchNavigation(status, "/queue")).toBe(false);
  });
  it.each(["completed", "cancelled", null])("releases navigation only after %s", (status) => {
    expect(mustStayInMatch(status)).toBe(false);
    expect(blocksMatchNavigation(status, "/inicio")).toBe(false);
  });
});