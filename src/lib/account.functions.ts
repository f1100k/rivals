import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * LGPD self-service deletion: anonymizes the caller's personal data while keeping
 * match history consistent for the other players (results stay, name becomes anonymous).
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm: string }) => {
    if (input?.confirm !== "EXCLUIR") throw new Error("Digite EXCLUIR para confirmar.");
    return input;
  })
  .handler(async ({ context }) => {
    const id = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: files } = await supabaseAdmin.storage.from("avatars").list(id);
    if (files?.length) {
      await supabaseAdmin.storage.from("avatars").remove(files.map((f) => `${id}/${f.name}`));
    }
    await supabaseAdmin.from("queue").delete().eq("user_id", id);
    await supabaseAdmin.from("discord_links").delete().eq("user_id", id);

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        name: `Jogador removido ${id.slice(0, 4)}`,
        avatar_url: null,
        primary_position: null,
        secondary_position: null,
      })
      .eq("id", id);
    if (pErr) throw new Error("Não consegui apagar seus dados. Tente de novo.");

    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: `removido-${id}@conta-excluida.invalid`,
      user_metadata: {},
      ban_duration: "876000h",
    });
    if (aErr) throw new Error("Não consegui encerrar sua conta. Tente de novo.");
    return { ok: true };
  });
