import { z } from "zod";

export const botRequest = z.object({
  count: z.number().int().min(1).max(8),
  position: z.enum(["Goleiro", "Pivô", "Ala", "Fixo"]),
  test: z.boolean().optional(),
});
export const closeVoteRequest = z.object({
  match: z.string().uuid(),
  side: z.enum(["a", "b"]),
  reason: z.string().trim().min(1, "Informe o motivo.").max(500),
});