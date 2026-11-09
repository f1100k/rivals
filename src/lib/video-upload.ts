export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_VIDEO_LABEL = "2 GB";
export function validPlayerVideo(file: Pick<File, "type" | "size">) {
  return ["video/mp4", "video/webm"].includes(file.type) && file.size > 0 && file.size <= MAX_VIDEO_BYTES;
}
