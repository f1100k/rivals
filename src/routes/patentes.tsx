import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { rankStep, RANK_LADDER, DIVISION_MMR } from "@/lib/inhouse";
import { RankBadge } from "@/components/RankBadge";
import { MatchmakingRules } from "@/components/MatchmakingRules";

export const Route = createFileRoute("/patentes")({
  head: () => ({
    meta: [
      { title: "Patentes · Inhouse Rematch" },
      { name: "description", content: "Patentes, regras competitivas, pontuação, denúncias e proteção de MMR no Rivals Inhouse." },
      { property: "og:title", content: "Patentes · Inhouse Rematch" },
      { property: "og:description", content: "Patentes, regras competitivas, pontuação, denúncias e proteção de MMR no Rivals Inhouse." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Patentes,
});

function Patentes() {
  const [myRating, setMyRating] = useState<number | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("profiles")
        .select("rating")
        .eq("id", data.user.id)
        .single()
        .then(({ data: p }) => setMyRating(typeof p?.rating === "number" ? p.rating : null));
    });
  }, []);
  const myStep = myRating != null ? rankStep(myRating) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl font-bold">Patentes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A cada {DIVISION_MMR} MMR você sobe uma divisão. São três divisões por patente, até a Elite.
      </p>
      {myRating != null && (
        <p className="mt-3 text-sm">
          Seu MMR: <span className="font-bold text-primary">{myRating}</span> — você está em{" "}
          <RankBadge rating={myRating} />
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, ti) => {
          const entries = RANK_LADDER.slice(ti * 3, ti * 3 + 3);
          const tier = entries[0]?.tier ?? "";
          return (
            <div key={tier} className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-primary">{tier}</h2>
              <ul className="mt-3 space-y-2">
                {entries.map((e) => {
                  const mine = myStep === ti * 3 + e.div - 1;
                  const top = e.tier === "Elite" && e.div === 3;
                  return (
                    <li
                      key={e.div}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${mine ? "border-primary bg-primary/10" : "border-border"}`}
                    >
                      <RankBadge rating={e.min} />
                      <span className={mine ? "font-bold text-primary" : "text-muted-foreground"}>
                        {e.min} MMR{top ? "+" : ""}
                      </span>
                      {mine && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                          Você
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <MatchmakingRules />
    </main>
  );
}
