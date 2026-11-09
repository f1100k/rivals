import { describe, expect, it } from "vitest";
import { AVATAR_FRAMES, availableAvatarFrames } from "./avatar-frames";

describe("avatar frames", () => {
  it("preserves the other frames at the requested 150% default size", () => {
    expect(AVATAR_FRAMES.filter((frame) => frame.id !== "neon-roxo").map((frame) => frame.fit)).toEqual(Array(10).fill(150));
  });
  it("keeps the approved neon alignment even without a saved fit", () => {
    const neon = AVATAR_FRAMES.find((frame) => frame.id === "neon-roxo");
    if (!neon) throw new Error("Missing neon frame");
    expect(resolveFit(neon, null)).toEqual({ fit: 187, offsetX: 0.5, offsetY: -2.5 });
  });
  it("offers eleven art frames with unique ids and images", () => {
    expect(AVATAR_FRAMES).toHaveLength(11);
    expect(new Set(AVATAR_FRAMES.map((f) => f.id)).size).toBe(11);
    for (const f of AVATAR_FRAMES) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.image).toMatch(/^\/__l5e\/assets-v1\//);
    }
    expect(AVATAR_FRAMES.map((f) => f.id)).toContain("coroa-fogo");
  });
});

import { clampFit, resolveFit } from "./avatar-frames";

describe("manual frame fit", () => {
  it("uses the saved adjustment over the default", () => {
    const def = AVATAR_FRAMES[0];
    if (!def) throw new Error("Missing frame catalog");
    expect(resolveFit(def, null)).toEqual({ fit: def.fit, offsetX: 0, offsetY: 0 });
    expect(resolveFit(def, { fit: 300, offsetX: 4, offsetY: -6 })).toEqual({ fit: 300, offsetX: 4, offsetY: -6 });
  });
  it("clamps size to 100-450% and offsets to ±50%", () => {
    expect(clampFit({ fit: 900, offsetX: 80, offsetY: -80 })).toEqual({ fit: 450, offsetX: 50, offsetY: -50 });
    expect(clampFit({ fit: 10, offsetX: 0, offsetY: 0 }).fit).toBe(100);
  });
});

describe("frame access", () => {
  it("makes uploaded public frames available to ordinary players", () => {
    const uploaded = { id: "custom-test", label: "Nova", image: "frame.png", fit: 150, publicAccess: true };
    expect(availableAvatarFrames(false, [], [...AVATAR_FRAMES, uploaded]).map(f => f.id)).toEqual(["custom-test"]);
  });
  it("keeps uploaded restricted frames limited to grants or admins", () => {
    const uploaded = { id: "custom-private", label: "Privada", image: "frame.png", fit: 150, publicAccess: false };
    expect(availableAvatarFrames(false, [], [uploaded])).toEqual([]);
    expect(availableAvatarFrames(false, [uploaded.id], [uploaded])).toEqual([uploaded]);
  });
  it("gives admins all eleven frames", () => {
    expect(availableAvatarFrames(true).map((f) => f.id)).toEqual(AVATAR_FRAMES.map((f) => f.id));
  });
  it("gives Hiei's explicit grant only the neon frame", () => {
    expect(availableAvatarFrames(false, ["neon-roxo"]).map((f) => f.id)).toEqual(["neon-roxo"]);
  });
  it("gives ordinary players no frames", () => {
    expect(availableAvatarFrames(false)).toEqual([]);
  });
});
