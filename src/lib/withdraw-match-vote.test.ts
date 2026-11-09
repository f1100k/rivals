import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0020_exclusive_withdrawable_match_votes.sql", "utf8");
const withdrawal = sql.split("CREATE OR REPLACE FUNCTION public.withdraw_match_vote_gk()")[1];

describe("exclusive withdrawable match ballots", () => {
  it("allows only one winner or cancellation ballot per player", () => {
    expect(sql).toContain("CHECK (vote IS NULL OR NOT cancel_vote)");
    expect(sql.match(/AND \(vote IS NOT NULL OR cancel_vote\)/g)).toHaveLength(2);
    expect(sql.match(/RAISE EXCEPTION 'retire_voto_atual'/g)).toHaveLength(2);
  });
  it("withdraws only the authenticated participant ballot under the match lock", () => {
    expect(withdrawal).toContain("v_uid uuid:=auth.uid()");
    expect(withdrawal).toContain("FOR UPDATE OF m");
    expect(withdrawal).toContain("SET vote=NULL,cancel_vote=false WHERE match_id=v_match AND user_id=v_uid");
  });
  it("cannot withdraw after completion or cancellation and never changes MMR", () => {
    expect(withdrawal).toContain("m.status IN ('draft','room','voting','reporting','disputed')");
    expect(withdrawal).toContain("IF v_match IS NULL THEN RAISE EXCEPTION 'sem_partida_ativa'");
    expect(withdrawal).not.toMatch(/UPDATE public\.(matches|profiles)/);
  });
  it("still requires six cancellation votes or six votes for one winner", () => {
    expect(sql).toContain("IF v_count>=6 THEN");
    expect(sql).toContain("v_winner:=public.vote_winner_gk(v_a,v_b)");
    expect(sql).toContain("public.finalize_match_gk(v_match,v_a,v_b)");
  });
});