import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { rpc: (...a: unknown[]) => rpc(...a), channel: () => channel, removeChannel: vi.fn() } };
});

import { QueueChat, CHAT_MAX_LENGTH } from "./QueueChat";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === "get_queue_chat"
      ? { data: [{ id: "1", userId: "u1", body: "bora", createdAt: "2026-11-08T05:00:00Z", name: "Zé", avatarUrl: null, isMe: false }], error: null }
      : { data: "new", error: null },
  );
});

describe("queue chat", () => {
  it("shows messages of the match room it was opened for", async () => {
    wrap(<QueueChat matchId="m1" title="Chat da partida" />);
    expect(await screen.findByText("bora")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("get_queue_chat", { p_match: "m1" });
  });

  it("sends the trimmed text to the match room and clears the box", async () => {
    wrap(<QueueChat matchId="m1" title="Chat da partida" />);
    const box = screen.getByLabelText("Mensagem") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "  vamo time A  " } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("send_queue_chat", { p_match: "m1", p_body: "vamo time A" }));
    await waitFor(() => expect(box.value).toBe(""));
  });

  it("uses the shared waiting room when there is no match", async () => {
    wrap(<QueueChat matchId={null} title="Chat da fila" />);
    await screen.findByText("bora");
    expect(rpc).toHaveBeenCalledWith("get_queue_chat", {});
  });

  it("limits a message to 300 characters", () => {
    wrap(<QueueChat matchId={null} title="Chat da fila" />);
    const box = screen.getByLabelText("Mensagem") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "a".repeat(400) } });
    expect(CHAT_MAX_LENGTH).toBe(300);
    expect(box.value).toHaveLength(300);
  });
});
