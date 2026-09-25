/**
 * IapPort: purchases. One product at launch: remove_ads (non-consumable).
 * Real implementation: ops/real/billing.ts (Capacitor billing plugin). Tests use ops/fake/fakeIap.ts.
 */
export type ProductId = "remove_ads";

export interface Product {
  id: ProductId;
  /** Localized price string from the store, e.g. "$2.99". Empty when the store is unreachable. */
  price: string;
}

export type PurchaseResult = "purchased" | "cancelled" | "failed" | "already_owned";

export interface IapPort {
  products(): Promise<Product[]>;
  purchase(id: ProductId): Promise<PurchaseResult>;
  /** Restores non-consumables after reinstall; returns the owned ids. */
  restore(): Promise<ProductId[]>;
  owns(id: ProductId): Promise<boolean>;
}
