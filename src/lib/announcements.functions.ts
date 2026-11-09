import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { message: string }) => {
    const message = String(input?.message ?? "").trim();
    if (!message || message.length > 1500) throw new Error("A mensagem precisa ter entre 1 e 1500 caracteres.");
    return { message };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("post_announcement", { p_message: data.message });
    if (error) throw new Error(error.message.includes("sem_permissao") ? "Somente administradores podem enviar avisos." : "Não foi possível enviar o aviso.");
    let discord = true;
    try {
      const { postAnnouncement } = await import("@/lib/discord.server");
      await postAnnouncement(data.message);
    } catch (e) {
      console.error("Discord announcement failed", e);
      discord = false;
    }
    return { discord };
  });
