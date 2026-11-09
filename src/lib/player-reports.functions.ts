import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ReportMatch {
  id: string;
  completedAt: string;
  players: { userId: string; name: string; isMe: boolean; reported: boolean }[];
}
export interface ReportState {
  sanction: { strikes: number; bannedUntil: string | null } | null;
  matches: ReportMatch[];
}
export interface AdminReport {
  targetId: string;
  name: string;
  strikes: number;
  cycle: number;
  bannedUntil: string | null;
  pending: number;
  reports: { id: string; matchId: string; cycle: number; reason: string; dismissed: boolean; verdict: string | null; createdAt: string; reporterId: string; reporterName: string | null }[];
}

export const getMyReportMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_report_matches");
    if (error) throw new Error(error.message);
    return data as unknown as ReportState;
  });

export const submitPlayerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string; targetId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("submit_player_report", {
      p_match: data.matchId, p_target: data.targetId, p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const getAdminPlayerReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_admin_player_reports");
    if (error) throw new Error(error.message);
    return data as unknown as AdminReport[];
  });

export const reviewPlayerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetId: string; reportId: string | null; action: "dismiss" | "uphold" | "lift"; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("review_player_report", {
      p_target: data.targetId, p_report: data.reportId ?? "00000000-0000-0000-0000-000000000000", p_action: data.action, p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return true;
  });