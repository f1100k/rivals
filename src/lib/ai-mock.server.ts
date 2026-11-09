// Server-only: replaces the AI gateway when LOCAL_AI_MOCK=1 (offline environment in infra/local).
// Answers in the gateway's own SSE format, so the real parsing and saving code still runs.
import type { PrintName, PrintPerson, PrintPlayer } from "./print-players";

export const aiMockEnabled = () => process.env["LOCAL_AI_MOCK"] === "1";

function sseResponse(payload: unknown): Response {
  const event = { type: "response.output_text.done", text: JSON.stringify(payload) };
  return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

/** Every roster player appears on the print; the first one is the MVP. */
export function mockPrintRows(people: PrintPerson[]): PrintPlayer[] {
  return people.map((person, index) => ({
    gameName: person.name,
    siteName: person.name,
    goals: index % 3,
    assists: (index + 1) % 3,
    passes: 10 + index,
    interceptions: index % 4,
    saves: index % 5,
    score: 500 - index * 25,
    mvp: index === 0,
  }));
}

type Ballot = { user_id: string; team: string | null; vote: string | null };

/** The uploader wins unless the match's votes already favor the other team. */
export function mockUploaderResult(ballots: Ballot[], uploaderId: string): "vitoria" | "derrota" {
  const a = ballots.filter((b) => b.vote?.toLowerCase() === "a").length;
  const b = ballots.filter((b) => b.vote?.toLowerCase() === "b").length;
  if (a === b) return "vitoria";
  const leading = a > b ? "a" : "b";
  const team = ballots.find((ballot) => ballot.user_id === uploaderId)?.team?.toLowerCase();
  return !team || team === leading ? "vitoria" : "derrota";
}

export function mockScreenshotPayload(
  people: PrintPerson[],
  ballots: Ballot[],
  uploaderId: string,
) {
  return {
    found: true,
    result: mockUploaderResult(ballots, uploaderId),
    left: 3,
    right: 1,
    players: mockPrintRows(people),
  };
}

export async function mockScreenshotResponse(
  matchId: string,
  uploaderId: string,
  people: PrintPerson[],
): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("match_players")
    .select("user_id, team, vote")
    .eq("match_id", matchId);
  if (error) throw new Error(error.message);
  return sseResponse(mockScreenshotPayload(people, data ?? [], uploaderId));
}

export function mockPrintNamesResponse(people: PrintPerson[]): Response {
  const players: PrintName[] = people
    .slice(0, 10)
    .map((p) => ({ printName: p.name, siteName: p.name }));
  return sseResponse({ players });
}
