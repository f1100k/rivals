import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/discord/interactions")({
  server: { handlers: {
    POST: async ({ request }) => {
      const lovable = process.env["LOVABLE_API_KEY"];
      const connection = process.env["DISCORD_API_KEY"];
      if (!lovable || !connection) return new Response("Discord unavailable", { status: 503 });
      const { handleQueueInteraction } = await import("@/lib/discord-queue.server");
      return handleQueueInteraction(request, lovable, connection);
    },
  } },
});