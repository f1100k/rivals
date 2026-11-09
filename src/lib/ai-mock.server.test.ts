import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aiMockEnabled,
  mockPrintNamesResponse,
  mockPrintRows,
  mockScreenshotPayload,
  mockUploaderResult,
} from "./ai-mock.server";

const people = [
  { id: "1", name: "Ana" },
  { id: "2", name: "Bia" },
];
const ballots = [
  { user_id: "1", team: "a", vote: "b" },
  { user_id: "2", team: "b", vote: "b" },
];

afterEach(() => vi.unstubAllEnvs());

describe("AI mock", () => {
  it("is off unless explicitly enabled", () => {
    vi.stubEnv("LOCAL_AI_MOCK", "");
    expect(aiMockEnabled()).toBe(false);
    vi.stubEnv("LOCAL_AI_MOCK", "1");
    expect(aiMockEnabled()).toBe(true);
  });

  it("matches the result to the winning side of the vote", () => {
    expect(mockUploaderResult(ballots, "2")).toBe("vitoria");
    expect(mockUploaderResult(ballots, "1")).toBe("derrota");
    expect(mockUploaderResult([], "1")).toBe("vitoria");
  });

  it("never produces a tied score", () => {
    const payload = mockScreenshotPayload(people, ballots, "1");
    expect(payload.found).toBe(true);
    expect(payload.left).not.toBe(payload.right);
  });

  it("lists every player with a single MVP", () => {
    const rows = mockPrintRows(people);
    expect(rows.map((r) => r.siteName)).toEqual(["Ana", "Bia"]);
    expect(rows.filter((r) => r.mvp)).toHaveLength(1);
  });

  it("answers in the gateway SSE format", async () => {
    const line = (await mockPrintNamesResponse(people).text()).split("\n")[0]!;
    const event = JSON.parse(line.slice(5));
    expect(event.type).toBe("response.output_text.done");
    expect(JSON.parse(event.text).players[0]).toEqual({ printName: "Ana", siteName: "Ana" });
  });
});
