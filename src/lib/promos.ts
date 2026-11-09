import { supabase } from "@/integrations/supabase/client";

export type PromoKind = "text" | "image" | "video";
export type PromoItem = {
  id: string;
  kind: PromoKind;
  title: string;
  body: string | null;
  media_path: string | null;
  link_url: string | null;
  video_repeats: number;
  in_rotation: boolean;
  sort: number;
};
export type PromoSettings = { interval_seconds: number; enabled: boolean; size_percent: number };

/** Adjustable size of the corner widget, as a percentage of its normal size. */
export const PROMO_SIZE_MIN = 60;
export const PROMO_SIZE_MAX = 200;
const PROMO_BASE_WIDTH = 176; // small screens
const PROMO_BASE_WIDTH_LG = 256; // sm: and up

export function clampPromoSize(percent: number | null | undefined) {
  const n = Math.round(Number(percent ?? 100));
  if (!Number.isFinite(n)) return 100;
  return Math.min(PROMO_SIZE_MAX, Math.max(PROMO_SIZE_MIN, n));
}

/** Pixel widths of the corner widget for a given size percentage. */
export function promoWidths(percent: number | null | undefined) {
  const p = clampPromoSize(percent);
  return { width: Math.round((PROMO_BASE_WIDTH * p) / 100), widthLg: Math.round((PROMO_BASE_WIDTH_LG * p) / 100) };
}

export const PROMO_ROTATION_KEY = ["promo-rotation"] as const;
export const PROMO_ADMIN_KEY = ["promo-admin"] as const;
export const PROMO_COLUMNS = "id, kind, title, body, media_path, link_url, video_repeats, in_rotation, sort";
export const PROMO_IMAGE_MAX_BYTES = 50 * 1024 * 1024;
export const PROMO_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const PROMO_MAX_LABEL: Record<"image" | "video", string> = { image: "50 MB", video: "2 GB" };
export function promoFileTooBig(kind: "image" | "video", size: number) {
  return size > (kind === "video" ? PROMO_VIDEO_MAX_BYTES : PROMO_IMAGE_MAX_BYTES);
}

export function promoMediaUrl(path: string | null) {
  if (!path) return null;
  return supabase.storage.from("promos").getPublicUrl(path).data.publicUrl;
}

export async function fetchPromoRotation(): Promise<{ items: PromoItem[]; settings: PromoSettings }> {
  const [items, settings] = await Promise.all([
    supabase.from("promo_items").select(PROMO_COLUMNS).eq("in_rotation", true).order("sort"),
    supabase.from("promo_settings").select("interval_seconds, enabled, size_percent").maybeSingle(),
  ]);
  if (items.error) throw items.error;
  if (settings.error) throw settings.error;
  return {
    items: (items.data ?? []) as PromoItem[],
    settings: { size_percent: 100, ...((settings.data ?? {}) as Partial<PromoSettings>), interval_seconds: settings.data?.interval_seconds ?? 15, enabled: settings.data?.enabled ?? true } as PromoSettings,
  };
}

/** Moves `id` into the ordered rotation list at `index` (removing any earlier copy). */
export function placeInRotation(order: readonly string[], id: string, index: number) {
  const without = order.filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, without.length));
  return [...without.slice(0, at), id, ...without.slice(at)];
}

/** Next rotation index; videos advance only after playing `video_repeats` times. */
export function nextPromoIndex(current: number, total: number) {
  return total <= 0 ? 0 : (current + 1) % total;
}
