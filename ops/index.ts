export type { AdsPort, RewardedPlacement, InterstitialPlacement } from "./ads.js";
export type { IapPort, Product, ProductId, PurchaseResult } from "./iap.js";
export type { AnalyticsPort, AnalyticsEvent } from "./analytics.js";
export type { SavePort } from "./save.js";

import type { AdsPort } from "./ads.js";
import type { IapPort } from "./iap.js";
import type { AnalyticsPort } from "./analytics.js";
import type { SavePort } from "./save.js";

/** Everything the view needs from the outside world, injected once at startup. */
export interface Ops {
  ads: AdsPort;
  iap: IapPort;
  analytics: AnalyticsPort;
  save: SavePort;
}
