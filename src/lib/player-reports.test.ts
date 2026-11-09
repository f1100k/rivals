import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0015_anonymous_player_reports.sql", "utf8");
describe("participant reports", () => {
  it("requires seven reports before advancing the sanction", () => {
    expect(sql).toMatch(/IF n>=7 THEN/);
    expect(sql).toMatch(/UNIQUE\(target_id,cycle,reporter_id\)/);
    expect(sql).toMatch(/NOT dismissed/);
  });
  it("gives a first sanction of exactly one hour", () => {
    expect(sql).toMatch(/WHEN p_strikes=1 THEN 1/);
    expect(sql).toMatch(/make_interval\(hours=>public.report_ban_hours\(strikes\+1\)\)/);
  });
  it("gives a second sanction of exactly six hours", () => {
    expect(readFileSync("drizzle/migrations/0022_report_ban_24h_second_strike.sql","utf8")).toMatch(/WHEN p_strikes=2 THEN 24/);
  });
  it("makes the third sanction permanent", () => {
    expect(sql).toMatch(/WHEN strikes\+1>=3 THEN 'infinity'::timestamptz/);
  });
  it("requires a fresh match after the player returns", () => {
    expect(sql).toMatch(/IF ended<s.eligible_since THEN/);
    expect(sql).toMatch(/cycle=cycle\+1/);
  });
  it("identifies reporters only in the admin-checked projection", () => {
    const projection = readFileSync("drizzle/migrations/0033_admin_reporter_identity.sql", "utf8");
    expect(projection).toContain("IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'sem_permissao'");
    expect(projection).toContain("'reporterId',r.reporter_id,'reporterName',reporter.name");
    expect(projection).toContain("LEFT JOIN public.profiles reporter ON reporter.id=r.reporter_id");
    expect(projection).toContain("REVOKE ALL ON FUNCTION public.get_admin_player_reports() FROM PUBLIC, anon");
    expect(sql).not.toMatch(/GRANT SELECT ON public.player_reports TO authenticated/);
  });
});