/**
 * AdsPort: the only way the game shows an ad. The engine never sees this.
 * Real implementation: ops/real/admob.ts (Capacitor AdMob plugin) and the portal SDK on web.
 * Tests use ops/fake/fakeAds.ts.
 */
export type RewardedPlacement = "continue" | "daily_double";
export type InterstitialPlacement = "between_runs";

export interface AdsPort {
  /** True when a rewarded ad is loaded and policy allows showing one (R3: once per run). */
  rewardedAvailable(placement: RewardedPlacement): Promise<boolean>;
  /** Resolves true only if the player watched to the reward point. False on skip, error or no fill. */
  showRewarded(placement: RewardedPlacement): Promise<boolean>;
  /** Applies the interstitial cap (R4) internally; resolves false when capped, not loaded or ads removed. */
  showInterstitial(placement: InterstitialPlacement): Promise<boolean>;
  /** Called after a remove-ads purchase or restore; interstitials stop, rewarded stays. */
  setAdsRemoved(removed: boolean): void;
}
