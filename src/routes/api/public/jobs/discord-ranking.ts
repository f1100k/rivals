import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

// Hourly Discord ranking refresh; only the managed scheduler may call it.
export const Route = createFileRoute('/api/public/jobs/discord-ranking')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request)
        if (authFailure) return authFailure

        const { postRanking } = await import('@/lib/discord.server')
        await postRanking()
        // Backup sweep: close leftover temporary team calls.
        const { cleanupFinishedVoice } = await import('@/lib/match-voice.server')
        await cleanupFinishedVoice({ sweepText: true }).catch((e) => console.error('Voice cleanup failed', e))
        return Response.json({ success: true })
      },
    },
  },
})
