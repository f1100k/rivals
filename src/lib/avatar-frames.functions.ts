import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clampFit } from "./avatar-frames";

/** Saves the caller's avatar frame. The database enforces admin or per-frame access. */
export const setAvatarFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { frame: string | null }) => input)
  .handler(async ({ data, context }) => {
    const frame = data?.frame ?? null;
    const { data: ok, error } = await context.supabase.rpc("set_admin_avatar_frame", { p_frame: frame as string });
    if (error) {
      const msg = error.message.includes("sem_permissao")
        ? "Você não tem permissão para usar essa moldura."
        : error.message.includes("invalid_frame")
          ? "Moldura inválida."
          : error.message;
      throw new Error(msg);
    }
    return ok;
  });

/** Saves a global manual size/position adjustment for one frame. Admin-only in the database. */
export const setAvatarFrameFit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { frame: string; fit: number; offsetX: number; offsetY: number }) => input)
  .handler(async ({ data, context }) => {
    const f = clampFit({ fit: Number(data.fit), offsetX: Number(data.offsetX), offsetY: Number(data.offsetY) });
    const { error } = await context.supabase.rpc("set_avatar_frame_fit", {
      p_frame: data.frame,
      p_fit: f.fit,
      p_offset_x: f.offsetX,
      p_offset_y: f.offsetY,
    });
    if (error) throw new Error(error.message.includes("sem_permissao") ? "Só administradores ajustam molduras." : error.message);
    return f;
  });
