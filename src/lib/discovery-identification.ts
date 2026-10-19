export interface IdentifiedSpecies { id: number; slug: string; name_sv: string }
export interface Identification { species_slug: string; confidence: number }

// Provisional only: Patrik must review the sourced photo trial before this is permanent.
export const PROVISIONAL_CONFIDENCE_THRESHOLD = 0.70;

export function assessIdentification(result: Identification, species: IdentifiedSpecies[]) {
  const match = species.find((s) => s.slug === result.species_slug);
  if (!match || result.species_slug === 'none' || !Number.isFinite(result.confidence) ||
      result.confidence < PROVISIONAL_CONFIDENCE_THRESHOLD || result.confidence > 1) {
    return { accepted: false as const, species: null };
  }
  return { accepted: true as const, species: match };
}