const nodemailer = require("nodemailer");

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

let transporter = null;
if (SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === "true",
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
} else {
  console.warn(
    "WARNING: SMTP_HOST is not set. Password reset emails will be logged to the " +
      "console instead of actually sent - fine for local dev, not for real use."
  );
}

async function sendPasswordResetEmail(to, resetUrl) {
  if (!transporter) {
    console.log(`[mailer] Password reset for ${to}: ${resetUrl}`);
    return;
  }
  await transporter.sendMail({
    from: MAIL_FROM || `Game Night <no-reply@${SMTP_HOST}>`,
    to,
    subject: "Reset your Game Night password",
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    html: `<p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
  });
}

module.exports = { sendPasswordResetEmail };
