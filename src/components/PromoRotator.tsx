import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Maximize2, Megaphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchPromoRotation, nextPromoIndex, promoMediaUrl, promoWidths, PROMO_ROTATION_KEY, type PromoItem } from "@/lib/promos";

export function PromoRotator() {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const plays = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const { data } = useQuery({ queryKey: PROMO_ROTATION_KEY, queryFn: fetchPromoRotation, refetchInterval: 60_000, staleTime: 30_000 });
  useEffect(() => setMounted(true), []);

  const items = data?.items ?? [];
  const total = items.length;
  const item: PromoItem | undefined = items[index % Math.max(total, 1)];
  const intervalMs = (data?.settings.interval_seconds ?? 15) * 1000;

  useEffect(() => { plays.current = 0; }, [item?.id, index]);
  // Rotation pauses while the enlarged view is open so the viewer can finish watching/reading.
  useEffect(() => {
    if (expanded || !item || item.kind === "video" || total <= 1) return;
    const t = setTimeout(() => setIndex((i) => nextPromoIndex(i, total)), intervalMs);
    return () => clearTimeout(t);
  }, [item, index, total, intervalMs, expanded]);
  // The small (always muted) video pauses while the enlarged copy plays with sound.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (expanded) v.pause();
    else void v.play().catch(() => undefined);
  }, [expanded]);

  if (!mounted || !data?.settings.enabled || !item) return null;

  function onEnded() {
    plays.current += 1;
    if (plays.current < (item?.video_repeats ?? 1) || total <= 1) {
      const v = video.current;
      if (v) { v.currentTime = 0; void v.play().catch(() => undefined); }
      return;
    }
    setIndex((i) => nextPromoIndex(i, total));
  }

  const media = promoMediaUrl(item.media_path);
  const { width, widthLg } = promoWidths(data.settings.size_percent);

  return (
    <>
      <aside
        aria-label="Divulgação"
        style={{ "--promo-w": `${width}px`, "--promo-w-lg": `${widthLg}px` } as CSSProperties}
        className="relative ml-auto w-[var(--promo-w)] max-w-[45%] shrink-0 self-start overflow-hidden rounded-lg sm:fixed sm:bottom-4 sm:right-4 sm:z-40 sm:ml-0 sm:max-w-[calc(100vw-2rem)] sm:rounded-xl border border-primary/40 bg-card/95 shadow-lg shadow-primary/20 backdrop-blur sm:w-[var(--promo-w-lg)]"
      >
        <div className="pointer-events-none absolute left-2 top-2 z-10 hidden items-center gap-1 rounded bg-background/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:flex">
          <Megaphone className="size-3 text-primary" /> Divulgação
        </div>
        <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded bg-background/70 p-1 text-muted-foreground">
          <Maximize2 className="size-3.5" />
        </div>
        <button
          type="button"
          aria-label="Ampliar divulgação"
          onClick={() => setExpanded(true)}
          className={`group block w-full cursor-zoom-in text-left ${item.kind === "text" ? "pt-6" : ""}`}
        >
          {item.kind === "image" && media && <img src={media} alt={item.title || "Divulgação"} className="aspect-video w-full object-cover transition-opacity group-hover:opacity-90" loading="lazy" />}
          {item.kind === "video" && media && (
            <video key={item.id} ref={video} src={media} autoPlay muted playsInline onEnded={onEnded} onError={() => setIndex((i) => nextPromoIndex(i, total))} className="pointer-events-none aspect-video w-full bg-background object-cover" />
          )}
          {item.kind === "text" ? (
            <div className="flex min-h-24 flex-col justify-center gap-1 p-3 pr-7">
              {item.title && <p className="font-display text-sm font-bold leading-tight text-foreground">{item.title}</p>}
              {item.body && <p className="line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">{item.body}</p>}
            </div>
          ) : item.title ? (
            <p className="truncate px-2.5 py-1.5 text-xs font-semibold text-foreground">{item.title}</p>
          ) : null}
        </button>
        {total > 1 && (
          <div className="flex justify-center gap-1 pb-1.5">
            {items.map((it, i) => (
              <button key={it.id} type="button" aria-label={`Mostrar item ${i + 1}`} onClick={() => setIndex(i)} className={`h-1 rounded-full transition-all ${i === index % total ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40"}`} />
            ))}
          </div>
        )}
      </aside>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-4xl gap-3 overflow-hidden border-primary/40 p-0">
          <div className="flex items-center gap-1.5 px-4 pt-4 pr-12 text-xs uppercase tracking-wider text-muted-foreground">
            <Megaphone className="size-3.5 text-primary" /> Divulgação
          </div>
          <DialogTitle className={item.title ? "px-4 font-display text-lg" : "sr-only"}>{item.title || "Divulgação"}</DialogTitle>
          {item.kind === "image" && media && <img src={media} alt={item.title || "Divulgação"} className="max-h-[75vh] w-full bg-background object-contain" />}
          {item.kind === "video" && media && expanded && (
            <video key={`big-${item.id}`} src={media} autoPlay controls playsInline className="max-h-[75vh] w-full bg-background object-contain" />
          )}
          {item.kind === "text" && item.body ? (
            <DialogDescription className="whitespace-pre-wrap px-4 text-base text-foreground/90">{item.body}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">Conteúdo de divulgação ampliado</DialogDescription>
          )}
          {item.link_url ? (
            <div className="flex justify-end px-4 pb-4">
              <Button asChild>
                <a href={item.link_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" /> Abrir link
                </a>
              </Button>
            </div>
          ) : (
            <div className="pb-1" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
