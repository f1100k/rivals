import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { NameColorDef } from "@/lib/name-colors";

export const NAME_COLORS_KEY = ["name-colors"] as const;
export const EQUIPPED_COLORS_KEY = ["equipped-name-colors"] as const;

export type NameColorRow = { id: string; name: string; style: string; color1: string; color2: string | null; created_at: string };

/** Every color/effect created by the staff (public catalog). */
export function useNameColorCatalog() {
  return useQuery({
    queryKey: NAME_COLORS_KEY,
    queryFn: async (): Promise<NameColorRow[]> => {
      const r = await supabase.from("name_colors").select("id,name,style,color1,color2,created_at").order("created_at");
      if (r.error) throw r.error;
      return r.data;
    },
    staleTime: 60000,
  });
}

/** The color each player chose to show on their name, for everyone to see. */
export function useEquippedNameColors() {
  return useQuery({
    queryKey: EQUIPPED_COLORS_KEY,
    queryFn: async () => {
      const r = await supabase.rpc("get_equipped_name_colors");
      if (r.error) throw r.error;
      return r.data as unknown as (NameColorDef & { user_id: string })[];
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
