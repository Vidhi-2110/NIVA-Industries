/**
 * Shared SMTP helpers for the website's form handlers.
 * Files under api/_lib are not exposed as routes by Vercel (leading underscore).
 *
 * Required environment variables (Vercel: Project → Settings → Environment Variables):
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   e.g. 465
 *   SMTP_USER   the mailbox that authenticates and sends, e.g. nivaindustries14@gmail.com
 *   SMTP_PASS   that mailbox's app password (NOT the normal account password)
 *   CONTACT_TO  the inbox that receives form submissions
 */

const nodemailer = require('nodemailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Single-line field: trimmed, line breaks removed (they end up in mail headers), length-capped.
function cleanLine(value, max = 200) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

// Multi-line field (message body): trimmed and length-capped.
function cleanText(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function isValidEmail(value) {
  return EMAIL_RE.test(value);
}

// Returns the configured transport + addresses, or null when the env vars are incomplete.
function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !CONTACT_TO) return null;

  const port = Number(SMTP_PORT);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // true for 465, false for 587/others (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return { transporter, from: `"NIVA Website" <${SMTP_USER}>`, to: CONTACT_TO };
}

// Common request guard: POST only, parsed JSON body, honeypot check.
// Returns the body, or null after it has already responded.
function readFormBody(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return null;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: a hidden field real visitors never fill; bots usually do. Pretend success.
  if (body.website) {
    res.status(200).json({ ok: true });
    return null;
  }

  return body;
}

module.exports = { escapeHtml, cleanLine, cleanText, isValidEmail, getMailer, readFormBody };
