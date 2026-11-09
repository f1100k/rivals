import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfileBannerEditor } from "./ProfileBanner";

const mocks = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ update: mocks.update }),
  storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: path } }), remove: mocks.remove }) },
} }));
mocks.update.mockReturnValue({ eq: mocks.eq });

describe("profile banner ownership", () => {
  it("removes only the owner's banner and clears their public profile field", async () => {
    render(<QueryClientProvider client={new QueryClient()}><ProfileBannerEditor userId="player-1" path="player-1/banner-test.jpg" name="Player" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Remover banner" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(["player-1/banner-test.jpg"]));
    expect(mocks.update).toHaveBeenCalledWith({ banner_url: null });
    expect(mocks.eq).toHaveBeenCalledWith("id", "player-1");
  });
});