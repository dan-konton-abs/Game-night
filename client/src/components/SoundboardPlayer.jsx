import { useEffect } from "react";
import { socket } from "../socket.js";
import { SOUNDBOARD_VOLUME_KEY } from "../soundboard.js";

function loadVolume() {
  const stored = Number(localStorage.getItem(SOUNDBOARD_VOLUME_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.7;
}

/**
 * Renders nothing - just a room-wide listener for one-shot soundboard SFX,
 * always mounted (like the dice-stage overlay) so a sound plays regardless
 * of which sidebar tab someone's looking at. No UI, no toast - by design,
 * players just hear it.
 */
export default function SoundboardPlayer() {
  useEffect(() => {
    function onPlay({ url }) {
      if (!url) return;
      const audio = new Audio(url);
      audio.volume = loadVolume();
      audio.play().catch(() => {
        // Autoplay can be blocked before any interaction on the page - since
        // there's deliberately no UI here to retry from, this one just
        // silently doesn't play rather than surfacing anything.
      });
    }

    socket.on("soundboard:play", onPlay);
    return () => socket.off("soundboard:play", onPlay);
  }, []);

  return null;
}
