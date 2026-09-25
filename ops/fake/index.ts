import type { Ops } from "../index.js";
import { FakeAds } from "./fakeAds.js";
import { FakeAnalytics } from "./fakeAnalytics.js";
import { FakeIap } from "./fakeIap.js";
import { FakeSave } from "./fakeSave.js";

export { FakeAds, FakeAnalytics, FakeIap, FakeSave };

export interface FakeOps extends Ops {
  ads: FakeAds;
  iap: FakeIap;
  analytics: FakeAnalytics;
  save: FakeSave;
}

/** One call gives a test every port, all scriptable. */
export function fakeOps(): FakeOps {
  return { ads: new FakeAds(), iap: new FakeIap(), analytics: new FakeAnalytics(), save: new FakeSave() };
}
