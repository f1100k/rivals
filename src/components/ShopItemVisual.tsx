import { Package } from "lucide-react";
import { useAvatarUrl, useFrameFits } from "./Avatar";
import { frameStyle, resolveFit, type AvatarFrameDef } from "@/lib/avatar-frames";
import coin from "@/assets/coin-r.png.asset.json";
export function ShopCoin({ className = "h-4 w-4" }: { className?: string }) { return <img src={coin.url} alt="moedas" className={`${className} inline-block object-contain`} />; }
export function ShopFramePreview({ frame, avatarPath, name = "?", size = "h-20 w-20" }: { frame?: AvatarFrameDef | undefined; avatarPath?: string | null; name?: string; size?: string }) {
  const url = useAvatarUrl(avatarPath);
  const fits = useFrameFits();
  return <span className={`relative grid place-items-center ${size}`}>
    <span className="relative grid h-full w-full place-items-center overflow-hidden rounded-full bg-muted text-2xl font-bold [clip-path:circle(50%)]">{url ? <img src={url} alt={name} className="absolute inset-0 h-full w-full object-cover" /> : frame ? name.slice(0, 1).toUpperCase() : <Package className="h-8 w-8 text-muted-foreground" />}</span>
    {frame && <img src={frame.image} alt="" aria-hidden className="avatar-frame-img" style={frameStyle(resolveFit(frame, fits.data?.[frame.id]))} />}
  </span>;
}