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

    return new Promise<boolean>((resolve) => {
      let gotReward = false;
      const handles: PluginListenerHandle[] = [];
      let settled = false;

      const finish = async (result: boolean) => {
        if (settled) return;
        settled = true;
        for (const h of handles) await h.remove();
        this.rewardedLoaded = false;
        void this.prepareRewarded();
        resolve(result);
      };

      void AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        gotReward = true;
      }).then((h) => handles.push(h));

      void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        void finish(gotReward);
      }).then((h) => handles.push(h));

      void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
        void finish(false);
      }).then((h) => handles.push(h));

      void AdMob.showRewardVideoAd().catch(() => {
        void finish(false);
      });
    });
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

  private prepareRewarded(): Promise<void> {
    if (this.preparePromise) return this.preparePromise;
    this.preparePromise = (async () => {
      this.rewardedLoaded = false;
      const handles: PluginListenerHandle[] = [];
      try {
        const loaded = new Promise<void>((resolve, reject) => {
          void AdMob.addListener(RewardAdPluginEvents.Loaded, () => resolve()).then((h) => handles.push(h));
          void AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => reject(new Error("reward load failed"))).then(
            (h) => handles.push(h),
          );
        });
        await AdMob.prepareRewardVideoAd({ adId: TEST_REWARDED_AD_ID, isTesting: true });
        await loaded;
        this.rewardedLoaded = true;
      } catch {
        this.rewardedLoaded = false;
      } finally {
        for (const h of handles) await h.remove();
        this.preparePromise = null;
      }
    })();
    return this.preparePromise;
  }
}
