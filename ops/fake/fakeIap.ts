import type { IapPort, Product, ProductId, PurchaseResult } from "../iap.js";

/** Scriptable fake: set `nextResult` before a purchase; `owned` persists within the instance. */
export class FakeIap implements IapPort {
  nextResult: PurchaseResult = "purchased";
  readonly owned = new Set<ProductId>();
  readonly calls: string[] = [];

  async products(): Promise<Product[]> {
    this.calls.push("products");
    return [{ id: "remove_ads", price: "$2.99" }];
  }

  async purchase(id: ProductId): Promise<PurchaseResult> {
    this.calls.push(`purchase:${id}`);
    if (this.owned.has(id)) return "already_owned";
    if (this.nextResult === "purchased") this.owned.add(id);
    return this.nextResult;
  }

  async restore(): Promise<ProductId[]> {
    this.calls.push("restore");
    return [...this.owned];
  }

  async owns(id: ProductId): Promise<boolean> {
    return this.owned.has(id);
  }
}
