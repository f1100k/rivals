import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProtectionState } from "@/lib/point-protection";

const { getPointProtection, activatePointProtection } = vi.hoisted(() => ({
  getPointProtection: vi.fn(),
  activatePointProtection: vi.fn(),
}));

vi.mock("@/lib/point-protection.functions", () => ({ getPointProtection, activatePointProtection }));
vi.mock("@tanstack/react-start", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@tanstack/react-start");
  return { ...actual, useServerFn: (fn: unknown) => fn };
});

import { PointProtection } from "./PointProtection";

function state(over: Partial<ProtectionState["result"]> = {}, wallet: Partial<ProtectionState> = {}): ProtectionState {
  return {
    dailyAvailable: true,
    dailyNextAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    rankStock: 5,
    history: [],
    result: {
      matchId: "11111111-1111-1111-1111-111111111111",
      completedAt: new Date().toISOString(),
      before: 165,
      after: 148,
      baseDelta: -17,
      delta: -17,
      averageA: 165,
      averageB: 150,
      protectionKind: null,
      trollingDelta: 0,
      blockedReason: null,
      ...over,
    },
    ...wallet,
  };
}

function wrap(s: ProtectionState) {
  getPointProtection.mockResolvedValue(s);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PointProtection /></QueryClientProvider>);
}

describe("point protection panel", () => {
  it("offers both activators and the timing hint when a defeat cost points", async () => {
    wrap(state());
    expect(await screen.findByText("Proteção por patente")).toBeInTheDocument();
    expect(screen.getByText("5 disponíveis")).toBeInTheDocument();
    expect(screen.getByText(/Ative agora, antes de entrar numa nova fila/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /diária$/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /patente$/ })).toBeEnabled();
  });

  it("explains instead of hiding when the defeat cost nothing", async () => {
    wrap(state({ baseDelta: 0, delta: 0, after: 165, blockedReason: "Esta derrota não descontou pontos, então não há o que proteger." }));
    expect(await screen.findByText(/Esta derrota não descontou pontos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /proteção de pontos · diária$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /proteção de pontos · patente$/ })).toBeNull();
  });

  it("sends the chosen activator to the database and never a client-made refund", async () => {
    activatePointProtection.mockResolvedValue(true);
    wrap(state());
    fireEvent.click(await screen.findByRole("button", { name: /patente$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar proteção" }));
    await waitFor(() =>
      expect(activatePointProtection).toHaveBeenCalledWith({
        data: { matchId: "11111111-1111-1111-1111-111111111111", category: "rank" },
      }),
    );
  });

  it("disables an activator the player does not have", async () => {
    wrap(state({}, { rankStock: 0, dailyAvailable: false }));
    expect(await screen.findByRole("button", { name: /patente$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /diária$/ })).toBeDisabled();
  });
});
