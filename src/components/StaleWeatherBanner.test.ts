import { describe, expect, it } from "vitest";
import { STALE_HOURS, weatherAgeHours } from "./StaleWeatherBanner";

describe("väder-varning", () => {
  it("varnar inte när gårdagens väder visas", () => {
    expect(weatherAgeHours("2026-10-10", new Date("2026-10-11T14:00:00Z"))).toBeLessThanOrEqual(STALE_HOURS);
  });
  it("varnar när väder är två dygn gammalt", () => {
    expect(weatherAgeHours("2026-10-09", new Date("2026-10-11T14:00:00Z"))).toBeGreaterThan(STALE_HOURS);
  });
});
