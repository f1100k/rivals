import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { ProtectionState } from './point-protection';

export const getPointProtection = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc('get_point_protection_state');
    if (error) throw new Error(error.message);
    return data as unknown as ProtectionState;
  });
export const activatePointProtection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { matchId: string; category: 'daily' | 'rank' }) => {
    if (!data.matchId || !['daily', 'rank'].includes(data.category)) throw new Error('Proteção inválida.');
    return data;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc('activate_point_protection', { p_match: data.matchId, p_category: data.category });
    if (error) throw new Error(error.message);
    return true;
  });