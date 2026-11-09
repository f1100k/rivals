import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import coinIcon from "@/assets/coin-r.png.asset.json";

/** Header coin counter: the signed-in player's shop coins. */
export function CoinBalance({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["coin-balance", userId],
    queryFn: async () => {
      const { data } = await supabase.from("coin_wallets").select("balance").eq("user_id", userId).maybeSingle();
      return data?.balance ?? 0;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
  return (
    <span
      title="Suas moedas"
      className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-xs font-bold tabular-nums"
    >
      <img src={coinIcon.url} alt="moedas" className="h-4 w-4 object-contain" />
      {data ?? 0}
    </span>
  );
}
