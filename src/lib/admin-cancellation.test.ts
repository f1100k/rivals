import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0019_admin_only_immediate_cancellation.sql", "utf8");
const participantSql = readFileSync("drizzle/migrations/0017_post_draft_cancellation_votes.sql", "utf8");

describe("immediate match cancellation permissions", () => {
  it("requires the admin role before any match mutation, excluding moderators and players", () => {
    expect(sql).toMatch(/IF NOT public\.has_role\(auth\.uid\(\), 'admin'\) THEN RAISE EXCEPTION 'sem_permissao'/);
    expect(sql).not.toContain("is_staff");
    expect(sql.indexOf("RAISE EXCEPTION 'sem_permissao'")).toBeLessThan(sql.indexOf("UPDATE public.matches"));
  });

  it("preserves completed matches and serializes cancellation with finalization", () => {
    expect(sql).toContain("WHERE id = p_match FOR UPDATE");
    expect(sql).toContain("IF v_status IN ('completed', 'cancelled') THEN RETURN false");
    expect(sql).toContain("INSERT INTO public.mod_actions");
    expect(sql).not.toMatch(/UPDATE\s+(?:public\.)?profiles/i);
  });

  it("retains the six-vote threshold for participant cancellation", () => {
    expect(participantSql).toMatch(/v_count\s*>=\s*6/);
  });
});