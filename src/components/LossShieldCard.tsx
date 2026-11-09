import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Only rendered for accounts listed in loss_shield_owners (RLS returns no row for anyone else).
export function LossShieldCard({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["loss-shield", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("loss_shield_owners").select("paired_losses,pending_loss").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (!data?.paired_losses) return null;

  return (
    <section className="flex items-center justify-between gap-4 rounded-2xl border border-primary/40 bg-card p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <p className="font-display uppercase">Proteção pessoal</p>
          <p className="text-sm text-muted-foreground">
            {data.pending_loss
              ? "Uma derrota seguida. Se perder a próxima, desconta 17 MMR; uma vitória reinicia a contagem."
              : "Sua próxima derrota não desconta MMR. Duas derrotas seguidas descontam 17 MMR e iniciam um novo par."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Derrotas continuam nas estatísticas. Esta proteção e seus registros são privados da sua conta.</p>
        </div>
      </div>
    </section>
  );
}
