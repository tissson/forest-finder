/**
 * src/lib/supabase.ts
 * =====================
 * Supabase-klient för webbappen. Använder ENDAST den publika
 * "anon"-nyckeln -- ALDRIG service role-nyckeln (den som backend
 * använder i api_server.py/push_worker.py). Service role-nyckeln
 * kringgår RLS helt; om den hamnar i frontend-kod exponeras den för
 * ALLA som öppnar webbläsarens devtools, vilket gör hela RLS-arbetet
 * i migration_auth_and_rls.sql meningslöst.
 *
 * Miljövariabler (Vite-konvention, måste börja med VITE_ för att
 * exponeras till klientkoden):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY   <- publik/anon-nyckel, INTE service role
 *
 * I Lovable: Project Settings -> Environment Variables (eller motsvarande
 * .env-hantering i projektet).
 */

import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Kastar INTE vid import -- det hade kraschat hela appen (inkl. SSR)
  // innan miljövariablerna är satta. Auth-anrop misslyckas tills dess.
  console.warn(
    'Saknar VITE_SUPABASE_URL och/eller VITE_SUPABASE_ANON_KEY. ' +
      'Sätt dem i .env -- ANVÄND INTE service role-nyckeln här.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
  auth: {
    // persistSession + autoRefreshToken (Supabase-default) sköter
    // förnyelse av access-token automatiskt i bakgrunden -- api.ts
    // behöver därför bara läsa av aktuell session, inte hantera
    // refresh-logik själv i normalfallet. Se apiFetch() i api.ts för
    // det fallback-scenario där en 401 ändå inträffar (t.ex. precis
    // vid tokenutgång).
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Hämtar access-token för aktuell session, eller null om utloggad.
 * Används av api.ts för att sätta Authorization-headern automatiskt.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('Kunde inte läsa Supabase-session:', error.message);
    return null;
  }
  return data.session?.access_token ?? null;
}

/**
 * Bekvämlighetsfunktion för att prenumerera på inloggning/utloggning,
 * t.ex. för att uppdatera UI-tillstånd i App.tsx.
 */
export function onAuthStateChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}
