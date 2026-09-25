import { describe, expect, it } from "vitest";
import { fakeOps, FakeSave } from "./index.js";

describe("FakeAds", () => {
  it("rewarded resolves true only when loaded and watched to the end", async () => {
    const { ads } = fakeOps();
    expect(await ads.showRewarded("continue")).toBe(true);
    ads.watchToEnd = false;
    expect(await ads.showRewarded("continue")).toBe(false);
    ads.rewardedLoaded = false;
    expect(await ads.rewardedAvailable("continue")).toBe(false);
    expect(await ads.showRewarded("continue")).toBe(false);
  });

  it("interstitials stop after remove-ads, rewarded keeps working", async () => {
    const { ads } = fakeOps();
    expect(await ads.showInterstitial("between_runs")).toBe(true);
    ads.setAdsRemoved(true);
    expect(await ads.showInterstitial("between_runs")).toBe(false);
    expect(await ads.showRewarded("continue")).toBe(true);
  });
});

describe("FakeIap", () => {
  it("purchase then owns then already_owned, and restore returns it", async () => {
    const { iap } = fakeOps();
    expect(await iap.owns("remove_ads")).toBe(false);
    expect(await iap.purchase("remove_ads")).toBe("purchased");
    expect(await iap.owns("remove_ads")).toBe(true);
    expect(await iap.purchase("remove_ads")).toBe("already_owned");
    expect(await iap.restore()).toEqual(["remove_ads"]);
  });

  it("a cancelled purchase grants nothing", async () => {
    const { iap } = fakeOps();
    iap.nextResult = "cancelled";
    expect(await iap.purchase("remove_ads")).toBe("cancelled");
    expect(await iap.owns("remove_ads")).toBe(false);
  });
});

describe("FakeAnalytics", () => {
  it("drops every event until consent is granted", () => {
    const { analytics } = fakeOps();
    analytics.track({ name: "continue_offered" });
    expect(analytics.events).toHaveLength(0);
    expect(analytics.dropped).toHaveLength(1);
    analytics.setConsent(true);
    analytics.track({ name: "run_start", mode: "endless", seed: 1 });
    expect(analytics.events).toEqual([{ name: "run_start", mode: "endless", seed: 1 }]);
  });
});

describe("FakeSave", () => {
  it("round-trips, removes, and survives a simulated restart via snapshot", async () => {
    const save = new FakeSave();
    expect(await save.load("progress")).toBeNull();
    await save.store("progress", '{"high":10}');
    expect(await save.load("progress")).toBe('{"high":10}');
    const restarted = new FakeSave(save.snapshot());
    expect(await restarted.load("progress")).toBe('{"high":10}');
    await restarted.remove("progress");
    expect(await restarted.load("progress")).toBeNull();
  });
});
