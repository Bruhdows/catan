/** Table reactions use CC0 Kenney Emotes Pack sprites, Vector Style 3
 *  (white speech bubbles with dark glyphs — legible on the parchment UI). */
import { EMOTES, type EmoteName } from "@hexhaven/shared";

const EMOTE_STYLE = "Style 3";

export const EMOTE_LABELS: Record<EmoteName, string> = {
  faceHappy: "Happy", laugh: "Laugh", heart: "Love", star: "Star",
  idea: "Idea", question: "Question", exclamation: "Attention", alert: "Watch out",
  faceAngry: "Angry", anger: "Grr", faceSad: "Sad", drop: "Phew",
  sleep: "Sleepy", music: "Music", cash: "Money", swirl: "Dizzy",
};

export function emoteSrc(emote: EmoteName): string {
  return `/kenney/emotes-pack/PNG/Vector/${EMOTE_STYLE}/emote_${emote}.png`;
}

export function EmoteSprite({ emote, size = 26 }: { emote: EmoteName; size?: number }) {
  return <img src={emoteSrc(emote)} width={size} height={size} alt="" aria-hidden="true"
    style={{ width: size, height: size, objectFit: "contain" }} />;
}

/** Grid of reaction buttons, shown as a popover above its wrapper. */
export function EmotePicker({ onPick, onClose }: {
  onPick: (emote: EmoteName) => void; onClose?: () => void;
}) {
  return <div className="emote-picker" role="menu" aria-label="Pick a reaction" onBlur={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) onClose?.();
  }}>
    {EMOTES.map((emote) =>
      <button key={emote} role="menuitem" type="button" title={EMOTE_LABELS[emote]}
        aria-label={EMOTE_LABELS[emote]} onClick={() => onPick(emote)}>
        <EmoteSprite emote={emote} size={26} />
      </button>)}
  </div>;
}

/** Floating reaction bubble: sprite on top, sender name underneath. */
export function EmoteBubble({ name, emote }: { name: string; emote: EmoteName }) {
  return <div className="emote-bubble" role="status">
    <EmoteSprite emote={emote} size={34} />
    <span>{name}</span>
  </div>;
}
