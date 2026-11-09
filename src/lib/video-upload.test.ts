import { expect, it } from "vitest";
import { validPlayerVideo, MAX_VIDEO_BYTES } from "./video-upload";
it("accepts videos up to exactly 2 GB", () => expect(validPlayerVideo({ type: "video/mp4", size: 2 * 1024 * 1024 * 1024 })).toBe(true));
it("rejects a video larger than 2 GB", () => expect(validPlayerVideo({ type: "video/webm", size: MAX_VIDEO_BYTES + 1 })).toBe(false));
it("rejects non-video uploads", () => expect(validPlayerVideo({ type: "image/png", size: 100 })).toBe(false));
