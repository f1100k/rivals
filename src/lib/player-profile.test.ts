import { describe, expect, it } from "vitest";
import { validatePositions } from "./player-profile";

describe("player position preferences", () => {
  it("accepts a primary goalkeeper and secondary outfield position", () => {
    expect(validatePositions({ primary: "Goleiro", secondary: "Fixo" })).toEqual({ primary: "Goleiro", secondary: "Fixo" });
  });
  it("rejects identical primary and secondary positions", () => {
    expect(() => validatePositions({ primary: "Ala", secondary: "Ala" })).toThrow("Escolha posições diferentes.");
  });
  it("rejects positions outside the inhouse position set", () => {
    expect(() => validatePositions({ primary: "Atacante", secondary: null })).toThrow("Posição inválida.");
  });
});