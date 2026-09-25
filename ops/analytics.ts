/**
 * AnalyticsPort: the event list from HANDOFF "Analytics from day one".
 * Names are fixed here so dashboards do not drift; add an event by adding a member, never by a free string.
 * Real implementation: ops/real/analytics.ts. Tests use ops/fake/fakeAnalytics.ts.
 */
export type AnalyticsEvent =
  | { name: "run_start"; mode: "endless" | "daily"; seed: number }
  | { name: "run_end"; mode: "endless" | "daily"; score: number; placements: number; endedBy: "no_fit" | "declined_continue" }
  | { name: "continue_offered" }
  | { name: "continue_taken" }
  | { name: "ad_shown"; kind: "rewarded" | "interstitial"; placement: string }
  | { name: "ad_rewarded"; placement: string }
  | { name: "purchase"; product: string; result: string }
  | { name: "daily_played"; day: string }
  | { name: "session_length"; seconds: number };

export interface AnalyticsPort {
  track(event: AnalyticsEvent): void;
  /** Consent gate (Google UMP on phone). Nothing is sent while false. */
  setConsent(granted: boolean): void;
}
