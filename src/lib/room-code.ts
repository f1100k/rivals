// Room codes are numbers only (the game's lobby code), so text can never be saved as a code.
export const ROOM_CODE_MIN = 4;
export const ROOM_CODE_MAX = 10;

/** Keeps only digits as the player types or pastes, up to the maximum length. */
export function cleanRoomCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, ROOM_CODE_MAX);
}

export function isValidRoomCode(code: string): boolean {
  return new RegExp(`^\\d{${ROOM_CODE_MIN},${ROOM_CODE_MAX}}$`).test(code);
}

export const ROOM_CODE_ERROR = `O código da sala deve ter só números (${ROOM_CODE_MIN} a ${ROOM_CODE_MAX} dígitos).`;
