/**
 * src/lib/supabase.ts
 * =====================
 * Appens Supabase-klient. Vi skapar INTE en egen klient här längre --
 * projektet använder den genererade klienten i
 * src/integrations/supabase/client.ts (den läser rätt URL och publik
 * nyckel från miljön och hanterar sessionslagring även i preview).
 *
 * ALDRIG service role-nyckeln i frontend -- den kringgår RLS helt.
 */

import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export { supabase };

/** Sant när klienten har en URL och en publik nyckel att arbeta mot. */
export const isSupabaseConfigured = Boolean(
  (import.meta.env['VITE_SUPABASE_URL'] as string | undefined) &&
    ((import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string | undefined) ||
      (import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined))
);

/** Access-token för aktuell session, eller null om utloggad. */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('Kunde inte läsa Supabase-session:', error.message);
    return null;
  }
  return data.session?.access_token ?? null;
}

/** Prenumerera på inloggning/utloggning. */
export function onAuthStateChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}
