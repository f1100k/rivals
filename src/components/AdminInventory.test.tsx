import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminInventory } from "./AdminInventory";

const mocks = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("./Avatar", () => ({ useFrameCatalog: () => [] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "admin-1" } }, error: null }) },
  rpc: mocks.rpc,
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
} }));

describe("frame publication", () => {
  it("publishes at the entered shop price without calling individual grants or granting public access", async () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() });
    render(<QueryClientProvider client={new QueryClient()}><AdminInventory users={[]} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Nome da moldura"), { target: { value: "Nova moldura" } });
    fireEvent.change(screen.getByLabelText("Preço da moldura em moedas"), { target: { value: "350" } });
    fireEvent.change(screen.getByLabelText("Arquivo da moldura"), { target: { files: [new File(["png"], "frame.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar à loja" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith("admin_publish_shop_frame", {
      p_id: expect.stringMatching(/^custom-/), p_name: "Nova moldura", p_path: expect.stringMatching(/^admin-1\//), p_price: 350,
    });
    vi.unstubAllGlobals();
  });
});