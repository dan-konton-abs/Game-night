// Registry of selectable board themes. Add a new entry here plus a matching
// `.game-screen[data-theme="<id>"]` block in styles.css to add another one -
// the id must also be added to VALID_THEMES in server/index.js, since the
// server is the source of truth for what's actually allowed.
export const THEMES = [
  {
    id: "default",
    label: "Classic (Default)",
    description: "The regular Game Night look.",
  },
  {
    id: "scifi",
    label: "Sci-Fi — Ship Cockpit",
    description: "Glowing green terminal readouts, map shown on a bridge monitor.",
  },
];

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
