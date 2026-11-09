import { supabase } from "@/integrations/supabase/client";
import { MAX_VIDEO_LABEL, validPlayerVideo } from "./video-upload";

/** Browser-only chunked (TUS) upload to a storage bucket, so big videos never go in one request. */
export async function uploadResumable(
  file: File,
  bucket: string,
  path: string,
  cacheControl: string,
  onProgress: (progress: number) => void,
) {
  const session = await supabase.auth.getSession();
  if (!session.data.session) throw new Error("Entre novamente na sua conta.");
  const { Upload } = await import("tus-js-client");
  const token = session.data.session.access_token;
  const endpoint = `${import.meta.env['VITE_SUPABASE_URL']}/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint, retryDelays: [0, 1000, 3000, 5000], chunkSize: 6 * 1024 * 1024,
      headers: { authorization: `Bearer ${token}`, apikey: import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] },
      metadata: { bucketName: bucket, objectName: path, contentType: file.type, cacheControl },
      uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)),
      onError: () => reject(new Error("O envio do vídeo falhou. Tente novamente.")),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

export async function uploadPlayerVideo(file: File, path: string, onProgress: (progress: number) => void) {
  if (!validPlayerVideo(file)) throw new Error(`Escolha MP4 ou WebM de até ${MAX_VIDEO_LABEL}.`);
  await uploadResumable(file, "player-videos", path, "3600", onProgress);
}
