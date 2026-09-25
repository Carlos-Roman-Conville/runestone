import type { AnalyticsEvent, AnalyticsPort } from "../analytics.js";

/** Records events only while consent is granted, mirroring the real gate. */
export class FakeAnalytics implements AnalyticsPort {
  consent = false;
  readonly events: AnalyticsEvent[] = [];
  /** Events dropped for lack of consent; tests assert nothing leaks. */
  readonly dropped: AnalyticsEvent[] = [];

  track(event: AnalyticsEvent): void {
    (this.consent ? this.events : this.dropped).push(event);
  }

  setConsent(granted: boolean): void {
    this.consent = granted;
  }
}
