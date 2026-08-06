// Shared between GMPanel.jsx (the volume slider) and wherever the one-shot
// "soundboard:play" listener actually lives (always-mounted, unlike GM
// Tools) - localStorage is the hand-off, read fresh at the moment a sound
// fires rather than needing any React state shared across the two.
export const SOUNDBOARD_VOLUME_KEY = "gamenight:soundboardVolume";
