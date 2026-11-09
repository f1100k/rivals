import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EquippedProfileTag } from "./ProfileTags";
import { EquippedEmblem } from "./Emblems";
import { PlayerName } from "./NameFonts";

type LikePlayer = { userId: string; name: string; liked: boolean };

export function PlayerLikeRoster({ players, pending, onLike, disabled = false }: {
  players: LikePlayer[];
  pending: string | null;
  onLike: (player: LikePlayer) => void;
  disabled?: boolean;
}) {
  return <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
    {players.map((player) => <li key={player.userId} className="flex min-w-0 items-center justify-between gap-2 border-b border-border py-3">
      <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm"><EquippedEmblem userId={player.userId} className="h-4 w-4" /><PlayerName userId={player.userId} name={player.name} className="truncate" /><EquippedProfileTag userId={player.userId} /></span>
      <Button variant={player.liked ? "ghost" : "outline"} size="sm" disabled={disabled || player.liked || pending !== null} aria-label={`Curtir ${player.name}`} onClick={() => onLike(player)}>
        <ThumbsUp size={14} className={player.liked ? "fill-primary text-primary" : ""} /> {player.liked ? "Curtido" : "Curtir"}
      </Button>
    </li>)}
  </ul>;
}