import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomCode } from "./RoomCode";
import { cleanRoomCode, isValidRoomCode } from "@/lib/room-code";

describe("Room code saves", () => {
  it("submits a player-provided code and clears it only after success", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<RoomCode roomCode={null} onSave={onSave} />);
    const input = screen.getByRole("textbox", { name: "Código da sala" });
    fireEvent.change(input, { target: { value: "  842912  " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("842912"));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("retains the player's code when saving fails", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<RoomCode roomCode="334653" onSave={onSave} />);
    const input = screen.getByRole("textbox", { name: "Código da sala" });
    fireEvent.change(input, { target: { value: "595660" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("595660"));
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue("595660");
  });

  it("drops letters and text typed into the box", () => {
    render(<RoomCode roomCode={null} onSave={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Código da sala" });
    fireEvent.change(input, { target: { value: "sala abc 12-34" } });
    expect(input).toHaveValue("1234");
  });

  it("never saves text without numbers", () => {
    const onSave = vi.fn();
    render(<RoomCode roomCode={null} onSave={onSave} />);
    const input = screen.getByRole("textbox", { name: "Código da sala" });
    fireEvent.change(input, { target: { value: "entra ai galera" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("Room code rule", () => {
  it("accepts only 4 to 10 digits", () => {
    expect(isValidRoomCode("842912")).toBe(true);
    expect(isValidRoomCode("123")).toBe(false);
    expect(isValidRoomCode("12345678901")).toBe(false);
    expect(isValidRoomCode("PLAYER-123")).toBe(false);
    expect(isValidRoomCode("84 29")).toBe(false);
  });

  it("strips everything that is not a digit", () => {
    expect(cleanRoomCode("cod: 842-912")).toBe("842912");
  });
});
