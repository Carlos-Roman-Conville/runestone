import type { PluginListenerHandle } from "@capacitor/core";
import { AdMob, RewardAdPluginEvents } from "@capacitor-community/admob";
import type { AdsPort, InterstitialPlacement, RewardedPlacement } from "../ads.js";

/** Google sample ad unit ids for development only (STEP1_EXPORT.md). */
const TEST_REWARDED_AD_ID = "ca-app-pub-3940256099942544/5224354917";
const TEST_INTERSTITIAL_AD_ID = "ca-app-pub-3940256099942544/1033173712";

/**
 * Capacitor AdMob implementation of AdsPort. Used on native Android in step 1+.
 * Web builds use FakeAds until a portal SDK is chosen.
 */
export class AdMobAds implements AdsPort {
  private adsRemoved = false;
  private initPromise: Promise<void> | null = null;
  private rewardedLoaded = false;
  private preparePromise: Promise<void> | null = null;

  setAdsRemoved(removed: boolean): void {
    this.adsRemoved = removed;
  }

  async rewardedAvailable(_placement: RewardedPlacement): Promise<boolean> {
    if (this.adsRemoved) return false;
    await this.ensureInitialized();
    return this.rewardedLoaded;
  }

  async showRewarded(_placement: RewardedPlacement): Promise<boolean> {
    if (this.adsRemoved) return false;
    await this.ensureInitialized();
    if (!this.rewardedLoaded) return false;

    let gotReward = false;
    let settle: (result: boolean) => void = () => {};
    const done = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    // Every listener is registered (awaited) before the ad is shown, so no event can fire
    // into the gap between "add listener" and "listener active".
    const handles: PluginListenerHandle[] = await Promise.all([
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        gotReward = true;
      }),
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => settle(gotReward)),
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => settle(false)),
    ]);
    try {
      AdMob.showRewardVideoAd().catch(() => settle(false));
      return await done;
    } finally {
      for (const h of handles) await h.remove();
      this.rewardedLoaded = false;
      void this.prepareRewarded();
    }
  }

  async showInterstitial(_placement: InterstitialPlacement): Promise<boolean> {
    if (this.adsRemoved) return false;
    await this.ensureInitialized();
    // TODO(R4): interstitial cap (skip first 3 runs, max 1 per 2 runs). Step 1 stub: always allowed.
    try {
      await AdMob.prepareInterstitial({ adId: TEST_INTERSTITIAL_AD_ID, isTesting: true });
      await AdMob.showInterstitial();
      return true;
    } catch {
      return false;
    }
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        // TODO(step 7): UMP consent before initialize
        await AdMob.initialize({ initializeForTesting: true });
        await this.prepareRewarded();
      })();
    }
    return this.initPromise;
  }

  /**
   * Load the next rewarded ad. The plugin's prepare call resolves once the ad has loaded
   * and rejects if it fails, so no load event is awaited (an event can fire before its
   * listener is live, which would leave this waiting forever).
   */
  private prepareRewarded(): Promise<void> {
    if (this.preparePromise) return this.preparePromise;
    this.preparePromise = (async () => {
      this.rewardedLoaded = false;
      try {
        await AdMob.prepareRewardVideoAd({ adId: TEST_REWARDED_AD_ID, isTesting: true });
        this.rewardedLoaded = true;
      } catch {
        this.rewardedLoaded = false;
      } finally {
        this.preparePromise = null;
      }
    })();
    return this.preparePromise;
  }
}
