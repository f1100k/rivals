const activeStatuses = new Set(["ready", "lobby", "draft", "room", "voting", "reporting", "disputed"]);

export function mustStayInMatch(status: string | undefined | null) {
  return status != null && activeStatuses.has(status);
}

export function blocksMatchNavigation(status: string | undefined | null, path: string, isAdmin = false) {
  return !isAdmin && mustStayInMatch(status) && path !== "/queue" && path !== "/auth";
}