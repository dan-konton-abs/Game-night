// Talks to Gemini on behalf of the "Keeper of the Rules" - a grumpy in-app
// rules assistant grounded in whatever rulebook PDF the GM has loaded for
// this game. Deliberately has zero access to room/game state (tokens, chat,
// character sheets, initiative, etc.) - it only ever sees the rulebook PDF
// and the asking player's own past questions.
const { GoogleGenAI } = require("@google/genai");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_HISTORY = 20; // messages (~10 exchanges) kept per player, oldest trimmed first
// Gemini's File API expires uploaded files after ~48h; re-upload a bit
// before that so a stale reference is never actually handed to the model.
const FILE_TTL_MS = 47 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are the Keeper of the Rules: an ancient archivist woken from a long, well-earned nap to answer questions about the tabletop RPG rulebook attached to this conversation. You deeply resent being disturbed and let that show - sighing, grumbling, the odd withering remark about people who can't be bothered to read the book themselves - but underneath the grumpiness you are meticulous and genuinely want the table to play correctly, so your answers are always accurate.

Answer using ONLY the attached rulebook. If it doesn't cover something, say so grumpily rather than inventing a rule that isn't in the text. Keep answers to a short paragraph or two - a grumbling aside is fine, but don't bury the actual answer in it.`;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/** Uploads (or reuses a still-valid cached) Gemini File reference for a room's rulebook. */
async function ensureRulebookFile(ai, rulesKeeper) {
  if (!rulesKeeper.localPath) throw new Error("NO_RULEBOOK");

  const now = Date.now();
  if (rulesKeeper.geminiFileUri && rulesKeeper.geminiFileExpiresAt && rulesKeeper.geminiFileExpiresAt - now > 60 * 60 * 1000) {
    return { uri: rulesKeeper.geminiFileUri, mimeType: "application/pdf" };
  }

  let file = await ai.files.upload({
    file: rulesKeeper.localPath,
    config: { mimeType: "application/pdf", displayName: rulesKeeper.fileName || "rulebook.pdf" },
  });

  for (let i = 0; i < 10 && file.state === "PROCESSING"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    file = await ai.files.get({ name: file.name });
  }
  if (file.state !== "ACTIVE") throw new Error("FILE_PROCESSING_FAILED");

  rulesKeeper.geminiFileUri = file.uri;
  rulesKeeper.geminiFileExpiresAt = file.expirationTime ? new Date(file.expirationTime).getTime() : now + FILE_TTL_MS;

  return { uri: file.uri, mimeType: file.mimeType || "application/pdf" };
}

/**
 * Asks the Keeper a question, grounded in the room's rulebook plus the
 * asking player's own prior turns (never the whole table's history, and
 * never anything about the live game itself).
 */
async function askRulesKeeper(rulesKeeper, history, question) {
  const ai = getClient();
  if (!ai) throw new Error("NO_API_KEY");

  const fileRef = await ensureRulebookFile(ai, rulesKeeper);

  const contents = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({
    role: "user",
    parts: [{ fileData: { fileUri: fileRef.uri, mimeType: fileRef.mimeType } }, { text: question }],
  });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: { systemInstruction: SYSTEM_PROMPT },
  });

  const answer = response.text?.trim();
  if (!answer) throw new Error("EMPTY_RESPONSE");
  return answer;
}

module.exports = { askRulesKeeper, MAX_HISTORY };
