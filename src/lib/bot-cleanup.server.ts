/** Removes finished bot matches and their bot accounts entirely (DB rows, then sign-in accounts). */
export async function purgeFinishedBots() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("purge_finished_bot_matches");
  if (error) throw new Error(error.message);
  for (const id of (data ?? []) as string[]) {
    await supabaseAdmin.auth.admin.deleteUser(id).catch((e) => console.error("bot delete", e));
  }
  return (data ?? []).length;
}
