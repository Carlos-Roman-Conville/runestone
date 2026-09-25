import type { AdsPort, InterstitialPlacement, RewardedPlacement } from "../ads.js";

/** Scriptable fake: set `rewardedLoaded` / `watchToEnd` / `interstitialLoaded` per test. Records every call. */
export class FakeAds implements AdsPort {
  rewardedLoaded = true;
  watchToEnd = true;
  interstitialLoaded = true;
  adsRemoved = false;
  readonly calls: string[] = [];

  async rewardedAvailable(placement: RewardedPlacement): Promise<boolean> {
    this.calls.push(`rewardedAvailable:${placement}`);
    return this.rewardedLoaded;
  }

  async showRewarded(placement: RewardedPlacement): Promise<boolean> {
    this.calls.push(`showRewarded:${placement}`);
    if (!this.rewardedLoaded) return false;
    return this.watchToEnd;
  }

  async showInterstitial(placement: InterstitialPlacement): Promise<boolean> {
    this.calls.push(`showInterstitial:${placement}`);
    if (this.adsRemoved || !this.interstitialLoaded) return false;
    return true;
  }

  setAdsRemoved(removed: boolean): void {
    this.calls.push(`setAdsRemoved:${removed}`);
    this.adsRemoved = removed;
  }
}
