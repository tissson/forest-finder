/**
 * src/components/DiscoverySuccessModal.tsx
 * ===========================================
 * Visar resultatet från en lyckad POST /discoveries (poäng, ny
 * totalsumma, ev. upplåst badge).
 *
 * KÄND BEGRÄNSNING: log_species_discovery() (se
 * migration_gamification_and_discoveries.sql) returnerar bara
 * badge_KEY (t.ex. "weekly_challenge_w35"), inte den läsbara titeln
 * som faktiskt finns lagrad i user_badges.title ("Veckans
 * Svamp-jägare"). humanizeBadgeKey() nedan är en STOPGAP (ersätter
 * understreck med mellanslag, versaliserar) -- inte en riktig fix.
 * Den riktiga fixen är att lägga till badge-titeln i SQL-funktionens
 * RETURN QUERY, en liten ändring om ni vill ha den.
 */

import type { DiscoveryUploadResult } from '../lib/api';

export interface DiscoverySuccessModalProps {
  isOpen: boolean;
  result: DiscoveryUploadResult | null;
  onClose: () => void;
}

function humanizeBadgeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DiscoverySuccessModal({ isOpen, result, onClose }: DiscoverySuccessModalProps) {
  if (!isOpen || !result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-700 bg-stone-900 p-6 text-center text-stone-100">
        <div className="mb-2 text-4xl">🍄</div>
        <h2 className="mb-1 text-lg font-semibold">Fynd registrerat!</h2>

        <p className="mb-4 text-3xl font-bold text-orange-500">+{result.points_awarded} p</p>

        <p className="mb-4 text-sm text-stone-400">
          Ny totalsumma: <span className="font-medium text-stone-200">{result.new_total_points} p</span>
        </p>

        {result.badge_unlocked && (
          <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-900/20 p-3">
            <p className="text-xs uppercase tracking-wide text-amber-400">Ny badge upplåst</p>
            <p className="mt-1 font-medium text-amber-200">🏅 {humanizeBadgeKey(result.badge_unlocked)}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
        >
          Fortsätt
        </button>
      </div>
    </div>
  );
}
