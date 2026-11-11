/** Short original synthesized interface cues. No bundled audio or autoplay. */
let context: AudioContext | null = null;
export function playCue(kind: "roll" | "build" | "trade" | "turn" | "victory"): void {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const frequencies = kind === "victory" ? [392, 494, 587, 784] :
      kind === "build" ? [420, 600] :
      kind === "trade" ? [550, 680] :
      kind === "roll" ? [310, 375] : [470];
    frequencies.forEach((hz, index) => {
      const start = now + index * 0.075;
      const o = context!.createOscillator();
      const g = context!.createGain();
      o.type = "sine";
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.045, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      o.connect(g).connect(context!.destination);
      o.start(start); o.stop(start + 0.175);
    });
  } catch { /* sound support is optional */ }
}
