import { describe, expect, it } from 'vitest';
import { assessIdentification } from './discovery-identification';

const species = [{ id: 1, slug: 'kantarell', name_sv: 'Kantarell' }];
describe('server identification acceptance', () => {
  it('rejects none even with confidence 1 rather than falling back', () => {
    expect(assessIdentification({ species_slug: 'none', confidence: 1 }, species)).toEqual({ accepted: false, species: null });
  });
  it('rejects unknown species', () => {
    expect(assessIdentification({ species_slug: 'flugsvamp', confidence: 0.99 }, species).accepted).toBe(false);
  });
  it('rejects confidence below the provisional 0.70 threshold', () => {
    expect(assessIdentification({ species_slug: 'kantarell', confidence: 0.699 }, species).accepted).toBe(false);
  });
  it('accepts exactly 0.70 provisionally', () => {
    expect(assessIdentification({ species_slug: 'kantarell', confidence: 0.70 }, species).accepted).toBe(true);
  });
  it('rejects invalid confidence instead of clamping it to acceptance', () => {
    for (const confidence of [NaN, Infinity, -1, 1.01]) {
      expect(assessIdentification({ species_slug: 'kantarell', confidence }, species).accepted).toBe(false);
    }
  });
});