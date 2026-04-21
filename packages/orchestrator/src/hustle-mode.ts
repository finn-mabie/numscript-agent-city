/**
 * Balance (in USD/2 minor units) at or below which an agent is considered broke.
 * $0.50 → 50 minor units. Chosen so small tx fees can't trivially push an agent into hustle mode.
 */
export const HUSTLE_THRESHOLD_CENTS = 50;

/**
 * Minimum number of consecutive low-balance ticks before entering hustle mode.
 * Prevents a momentary transfer-out from flipping the mode.
 */
export const HUSTLE_ENTRY_LOW_TICKS = 3;

export function shouldEnterHustle(s: { balanceNow: number; lowTickCount: number }): boolean {
  return s.balanceNow <= HUSTLE_THRESHOLD_CENTS && s.lowTickCount >= HUSTLE_ENTRY_LOW_TICKS;
}

export function shouldExitHustle(s: { balanceNow: number }): boolean {
  return s.balanceNow > HUSTLE_THRESHOLD_CENTS * 2;
}
