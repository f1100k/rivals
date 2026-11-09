import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const COUNTDOWN_QUERY_KEY = ["site-countdown"] as const;

export type SiteCountdownRow = { id: string; label: string; ends_at: string };

export async function fetchActiveCountdown(): Promise<SiteCountdownRow | null> {
  const { data, error } = await supabase
    .from("site_countdowns")
    .select("id, label, ends_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function splitRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function SiteCountdown() {
  const [now, setNow] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: COUNTDOWN_QUERY_KEY,
    queryFn: fetchActiveCountdown,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data || now === null) return null;
  const left = new Date(data.ends_at).getTime() - now;
  const finished = left <= 0;
  const { days, hours, minutes, seconds } = splitRemaining(left);
  const units = [
    ...(days > 0 ? [[days, "d"] as const] : []),
    [hours, "h"] as const,
    [minutes, "m"] as const,
    [seconds, "s"] as const,
  ];

  return (
    <aside
      aria-live="polite"
      className="relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-lg sm:fixed sm:bottom-4 sm:left-4 sm:z-40 sm:block sm:flex-none border border-primary/40 bg-card/95 px-2.5 py-1.5 shadow-lg shadow-primary/20 backdrop-blur sm:bottom-4 sm:left-4 sm:w-[min(18rem,calc(100vw-2rem))] sm:max-w-none sm:rounded-xl sm:p-3"
    >
      {/* Phones: one compact pill so it does not cover the page. */}
      <div className="min-w-0 sm:hidden">
        <p className="flex min-w-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Timer className="size-3 shrink-0 text-primary" />
          <span className="truncate">{data.label}</span>
        </p>
        <p className="font-display text-sm font-bold leading-tight tabular-nums text-primary">
          {finished ? "Começou!" : units.map(([v, u]) => `${pad(v)}${u}`).join(" ")}
        </p>
      </div>
      <div className="hidden sm:block">
      <div className="flex items-center gap-2">
        <Timer className="size-4 shrink-0 text-primary" />
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground" title={data.label}>{data.label}</p>
      </div>
      {finished ? (
        <p className="mt-2 font-display text-xl font-bold text-primary">Começou!</p>
      ) : (
        <div className="mt-2 flex gap-1.5">
          {units.map(([v, u]) => (
            <div key={u} className="flex-1 rounded-md bg-primary/10 px-1 py-1.5 text-center">
              <span className="block font-display text-xl font-bold leading-none tabular-nums text-foreground">{pad(v)}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{u}</span>
            </div>
          ))}
        </div>
      )}
      </div>
    </aside>
  );
}
