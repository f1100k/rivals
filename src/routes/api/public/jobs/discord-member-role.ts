import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

// Every-minute sweep giving the Membro role to new server members.
export const Route = createFileRoute('/api/public/jobs/discord-member-role')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request)
        if (authFailure) return authFailure
        const { syncMemberRole } = await import('@/lib/discord-autorole.server')
        try {
          return Response.json(await syncMemberRole())
        } catch (e) {
          console.error('Member role sync failed', e)
          return Response.json({ error: String(e) }, { status: 500 })
        }
      },
    },
  },
})
