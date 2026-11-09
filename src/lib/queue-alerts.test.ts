import { describe, expect, it } from "vitest";
import { queueAlerts } from "./queue-alerts";
const idle = { queued: false, matchId: null, status: null, queueCount: 0 };
const queued = { ...idle, queued: true, queueCount: 1 };
const draft = { queued: false, matchId: "match-10", status: "draft", queueCount: 0 };
describe("queue alert events", () => {
  it("alerts when a player enters the queue", () => expect(queueAlerts(idle, queued)).toEqual(["searching"]));
  it("pings when another player joins while we are queued", () =>
    expect(queueAlerts(queued, { ...queued, queueCount: 4 })).toEqual(["player-joined"]));
  it("does not ping when the queue shrinks or stays the same", () => {
    expect(queueAlerts({ ...queued, queueCount: 4 }, { ...queued, queueCount: 3 })).toEqual([]);
    expect(queueAlerts(queued, queued)).toEqual([]);
  });
  it("alerts when ten players form a match", () => expect(queueAlerts(queued, draft)).toEqual(["matched"]));
  it("alerts when goalkeepers finish the draft", () => expect(queueAlerts(draft, { ...draft, status: "room" })).toEqual(["draft-complete"]));
  it("does not repeat alerts on polls", () => expect(queueAlerts(draft, draft)).toEqual([]));
  it("does not announce stale matches on page load", () => expect(queueAlerts(null, draft)).toEqual([]));
});
