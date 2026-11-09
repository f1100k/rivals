import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminRatingEditor } from "./AdminRatingEditor";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
function setup() {
  render(<QueryClientProvider client={new QueryClient()}><AdminRatingEditor player={{ id: "player-1", name: "Player", rating: 20 }} onClose={vi.fn()} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Quantidade de pontos"), { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText("Motivo do ajuste"), { target: { value: "Correção administrativa" } });
}
describe("admin rating adjustment", () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.rpc.mockResolvedValue({ data: 50, error: null }); });
  it("sends a positive delta for addition without changing wins or losses", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Confirmar ajuste" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("admin_adjust_rating", { p_user: "player-1", p_delta: 30, p_reason: "Correção administrativa", p_request: expect.any(String) }));
  });
  it("sends a negative delta for removal", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ajuste" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("admin_adjust_rating", expect.objectContaining({ p_delta: -30 })));
  });
});