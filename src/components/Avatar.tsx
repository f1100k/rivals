import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_FRAMES, frameStyle, resolveFit, type FrameFit, type AvatarFrameDef } from "@/lib/avatar-frames";

export function useFrameCatalog() {
  const query = useQuery({ queryKey: ["frame-catalog"], staleTime: 60_000, queryFn: async () => {
    const { data, error } = await supabase.from("custom_avatar_frames").select("id,name,image_path,public_access").eq("active", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((f): AvatarFrameDef => ({ id: f.id, label: f.name, image: supabase.storage.from("frame-art").getPublicUrl(f.image_path).data.publicUrl, fit: 150, publicAccess: f.public_access }));
  } });
  return [...AVATAR_FRAMES, ...(query.data ?? [])];
}

const signed = new Map<string, string>();

export function useAvatarUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(() => (path ? signed.get(path) ?? null : null));
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    const cached = signed.get(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    // Public bucket + unique file names: fixed URL the browser/CDN can cache, no API call.
    const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    signed.set(path, publicUrl);
    setUrl(publicUrl);
  }, [path]);
  return url;
}

/** Frame choices per user, fetched once and shared by every avatar on screen. */
export function useAvatarFrameMap() {
  return useQuery({
    queryKey: ["avatar-frames"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avatar_frames").select("user_id, frame, frame_key");
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.user_id] = row.frame_key ?? row.frame;
      return map;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/** Manual size/position adjustments per frame, shared by every avatar. */
export function useFrameFits() {
  return useQuery({
    queryKey: ["avatar-frame-fits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avatar_frame_fits").select("frame, fit, offset_x, offset_y");
      if (error) throw new Error(error.message);
      const map: Record<string, FrameFit> = {};
      for (const r of data ?? []) map[r.frame] = { fit: Number(r.fit), offsetX: Number(r.offset_x), offsetY: Number(r.offset_y) };
      return map;
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}

export function useAvatarFrameClass(userId?: string | null) {
  const map = useAvatarFrameMap();
  return userId ? (map.data?.[userId] ?? null) : null;
}

export function Avatar({
  path,
  name,
  className,
  userId,
}: {
  path?: string | null | undefined;
  name: string;
  className?: string;
  userId?: string | null | undefined;
}) {
  const url = useAvatarUrl(path);
  const frame = useAvatarFrameClass(userId);
  const catalog = useFrameCatalog();
  const frameDef = frame ? catalog.find((f) => f.id === frame) : undefined;
  const fits = useFrameFits();
  return (
    <span className="relative flex h-full w-full items-center justify-center">
      <span className="relative flex h-full w-full min-w-0 items-center justify-center overflow-hidden rounded-full [clip-path:circle(50%)]">
        {url ? (
          <img src={url} alt={name} className={`absolute inset-0 block h-full w-full max-w-none object-cover ${className ?? ""}`} />
        ) : name.slice(0, 1).toUpperCase()}
      </span>
      {frameDef && (
        <img
          src={frameDef.image}
          alt=""
          aria-hidden
          className="avatar-frame-img"
          style={frameStyle(resolveFit(frameDef, fits.data?.[frameDef.id]))}
        />
      )}
    </span>
  );
}
