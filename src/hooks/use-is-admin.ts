import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Database-checked admin role for the given user (UI mirror only; RPCs re-check). */
export function useIsAdmin(userId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["is-admin", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: userId as string, _role: "admin" });
      if (error) throw error;
      return Boolean(data);
    },
  });
  return data === true;
}
