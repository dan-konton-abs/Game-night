import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";

const VOLUME_KEY = "gamenight:musicVolume";
const MUTED_KEY = "gamenight:musicMuted";

export default function MusicBar({ room, isGM }) {
  const audioRef = useRef(null);
  const [volume, setVolume] = useState(() => {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 0.5;
    const stored = Number(raw);
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.5;
  });
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTED_KEY) === "true");
  // Browsers block audio.play() calls that aren't triggered by a direct user
  // gesture on THIS page - a broadcast telling us the GM pressed Play is not
  // one, even though it usually still works once the player has clicked
  // anything at all on the page already. When it doesn't, this flags a
  // manual "enable sound" affordance instead of just staying silently muted.
  const [blocked, setBlocked] = useState(false);

  const { url, name, playing, loop, startedAt } = room.music;

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    localStorage.setItem(MUTED_KEY, String(muted));
  }, [muted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!url || !playing || !startedAt) {
      audio.pause();
      return;
    }

    const seekAndPlay = () => {
      const duration = audio.duration || 0;
      const elapsed = (Date.now() - startedAt) / 1000;
      audio.currentTime = duration > 0 ? elapsed % duration : 0;
      audio.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    };

    if (audio.readyState >= 1) seekAndPlay();
    else audio.addEventListener("loadedmetadata", seekAndPlay, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, playing, startedAt]);

  function enableSound() {
    audioRef.current
      ?.play()
      .then(() => setBlocked(false))
      .catch(() => {});
  }

  function togglePlay() {
    socket.emit(playing ? "music:stop" : "music:play");
  }

  if (!url && !isGM) return null;

  return (
    <div className="music-bar">
      <audio ref={audioRef} src={url || undefined} loop={loop} />
      {!url ? (
        <span className="hint">🎵 No ambient track set - add one from GM Tools.</span>
      ) : (
        <>
          <span className="music-track" title={name || "Track"}>
            🎵 {name || "Track"}
          </span>
          {isGM && (
            <button type="button" className="small" onClick={togglePlay}>
              {playing ? "⏹ Stop" : "▶ Play"}
            </button>
          )}
          {blocked && (
            <button type="button" className="small" onClick={enableSound}>
              🔈 Enable sound
            </button>
          )}
          <button type="button" className="music-mute" onClick={() => setMuted((m) => !m)} title={muted ? "Unmute" : "Mute"}>
            {muted || volume === 0 ? "🔇" : "🔊"}
          </button>
          <input
            type="range"
            className="music-volume"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              if (muted) setMuted(false);
            }}
            title="Your volume (only affects your own playback)"
          />
        </>
      )}
    </div>
  );
}
