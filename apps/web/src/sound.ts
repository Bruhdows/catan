/** Interface cues backed by CC0 Kenney interface sounds. No fallback audio:
 *  if a cue fails to load or decode, it is reported once and stays silent. */
let context: AudioContext | null = null;

export type CueKind = "roll" | "build" | "trade" | "turn" | "victory" | "emote";

/** Raw OGG files served from the vendored Kenney Interface Sounds pack. */
const SOURCES: Record<CueKind, string> = {
  roll: "/kenney/interface-sounds/Audio/glass_003.ogg",
  build: "/kenney/interface-sounds/Audio/confirmation_001.ogg",
  trade: "/kenney/interface-sounds/Audio/switch_002.ogg",
  turn: "/kenney/interface-sounds/Audio/confirmation_004.ogg",
  victory: "/kenney/interface-sounds/Audio/maximize_006.ogg",
  emote: "/kenney/interface-sounds/Audio/pluck_002.ogg",
};

const buffers = new Map<string, Promise<AudioBuffer | null>>();
const reported = new Set<string>();

function bufferFor(src: string): Promise<AudioBuffer | null> {
  let entry = buffers.get(src);
  if (!entry) {
    entry = (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await context!.decodeAudioData(await response.arrayBuffer());
      } catch (error) {
        if (!reported.has(src)) {
          reported.add(src);
          console.warn(`[sound] cue unavailable: ${src}`, error);
        }
        return null;
      }
    })();
    buffers.set(src, entry);
  }
  return entry;
}

export function playCue(kind: CueKind): void {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch (error) {
    console.warn("[sound] WebAudio unavailable, cues stay silent", error);
    return;
  }
  void bufferFor(SOURCES[kind]).then((buffer) => {
    if (!context || !buffer) return;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.4;
      source.connect(gain).connect(context.destination);
      source.start();
    } catch (error) {
      console.warn("[sound] could not play cue", error);
    }
  });
}
