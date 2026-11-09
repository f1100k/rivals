import { Crown, Diamond, Gem, Medal, Shield, Trophy } from "lucide-react";
import { rankName, rankStep } from "@/lib/inhouse";

const TIERS = [
  { key: "bronze", Icon: Shield },
  { key: "prata", Icon: Medal },
  { key: "ouro", Icon: Trophy },
  { key: "platina", Icon: Gem },
  { key: "diamante", Icon: Diamond },
  { key: "elite", Icon: Crown },
] as const;

/** Tag de patente com visual único por tier (cor, ícone e pips de divisão). */
export function RankBadge({ rating, className = "" }: { rating: number; className?: string }) {
  const step = rankStep(rating);
  const tier = TIERS[Math.min(Math.floor(step / 3), TIERS.length - 1)] ?? TIERS[0];
  const div = (step % 3) + 1;
  const { Icon } = tier;
  return (
    <span className={`rank-badge rank-badge--${tier.key} ${className}`} title={rankName(rating)}>
      <Icon aria-hidden />
      <span>{rankName(rating)}</span>
      <span className="rank-badge__pips" aria-hidden>
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= div ? "on" : ""} />
        ))}
      </span>
    </span>
  );
}
