import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FeatureKey } from "@/lib/features";

/** Database-checked feature permission (admins always have it). UI mirror only; the database re-checks. */
export function useHasFeature(userId: string | null | undefined, feature: FeatureKey) {
  const { data } = useQuery({
    queryKey: ["has-feature", userId, feature],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_feature", { _user_id: userId as string, _feature: feature });
      if (error) throw error;
      return Boolean(data);
    },
  });
  return data === true;
}
