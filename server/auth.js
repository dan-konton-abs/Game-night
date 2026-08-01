const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn(
    "WARNING: JWT_SECRET is not set. Using an insecure, process-local secret - " +
      "every restart invalidates all logins. Set JWT_SECRET before deploying for real."
  );
}
const secret = JWT_SECRET || require("crypto").randomBytes(32).toString("hex");

const TOKEN_TTL = "365d";

function signToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email }, secret, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };
