import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPointsBatch, previewCount } from "./AdminPointsBatch";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: () => ({ select: () => ({ eq: mocks.eq }) }) },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/admin-points.functions", () => ({ readPrintPlayerNames: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminPointsBatch users={[{ id: "p1", name: "Ryo", rating: 100, isGhost: false }]} />
    </QueryClientProvider>,
  );
}

describe("admin win/loss adjustment", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.eq.mockResolvedValue({ data: [{ id: "p1", wins: 12, losses: 7 }], error: null });
  });

  it("never lets a total go below zero", () => {
    expect(previewCount(2, -5)).toBe(0);
    expect(previewCount(12, 1)).toBe(13);
  });

  it("shows current totals and saves the edited totals as deltas without touching MMR", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Pontos para todos"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Nome do jogador"), { target: { value: "ry" } });
    fireEvent.click(await screen.findByText("12V · 7D"));
    const wins = await screen.findByLabelText("Vitórias de Ryo");
    expect((wins as HTMLInputElement).value).toBe("12");
    fireEvent.change(wins, { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Derrotas de Ryo"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_adjust_record", {
        p_user: "p1", p_wins_delta: 2, p_losses_delta: -1, p_reason: "Ajuste pelo painel", p_request: expect.any(String),
      }),
    );
    expect(mocks.rpc).not.toHaveBeenCalledWith("admin_adjust_rating", expect.anything());
  });
});
