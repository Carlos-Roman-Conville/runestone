export type SfxCue = "pickup" | "place" | "clear" | "combo" | "gameover";

/** Step 8 replaces this with real audio; step 5 is a typed no-op. */
export interface Sfx {
  play(cue: SfxCue, detail?: number): void;
}

export function noopSfx(): Sfx {
  return {
    play() {},
  };
}
