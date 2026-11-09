import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin user ids, exposed through the SECURITY DEFINER `get_staff_ids` RPC. */
export const getStaffIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_staff_ids");
    if (error) throw new Error(error.message);
    return (data ?? []) as string[];
  });
