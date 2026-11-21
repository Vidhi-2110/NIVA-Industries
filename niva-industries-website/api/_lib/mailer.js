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

// local@domain.tld — no spaces, quotes, angle brackets or commas (those could smuggle extra
// recipients into the Reply-To header), and a TLD of at least two letters.
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

// Digits plus the usual separators (+ - . space parentheses), 7–15 digits in total (E.164 max).
const PHONE_CHARS_RE = /^\+?[\d\s().-]+$/;

// Best-effort rate limit. Serverless instances are short-lived and not shared, so this only
// slows down a burst hitting one warm instance; use Vercel Firewall rate-limit rules for a hard limit.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const hits = new Map();

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
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

function isValidPhone(value) {
  if (typeof value !== 'string' || !PHONE_CHARS_RE.test(value)) return false;
  const digits = value.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isRateLimited(key) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded on a long-lived instance
  return recent.length > RATE_LIMIT_MAX;
}

// Browsers always send Origin on a cross-site or same-site fetch POST. Requiring it to match the
// host the request was sent to blocks other websites from posting to these endpoints from a
// visitor's browser, without hard-coding domains (works on the apex, www and preview URLs alike).
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
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

  return {
    transporter,
    from: `"NIVA Website" <${SMTP_USER}>`,                  // internal notifications to the company
    publicFrom: `"NIVA Power Industries" <${SMTP_USER}>`,   // emails that visitors receive
    to: CONTACT_TO,
  };
}

// Common request guard: POST only, same-origin, JSON body, rate limit, honeypot check.
// Returns the body, or null after it has already responded.
function readFormBody(req, res, scope = 'form') {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return null;
  }

  if (!isSameOrigin(req)) {
    res.status(403).json({ ok: false, error: 'Forbidden.' });
    return null;
  }

  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    res.status(415).json({ ok: false, error: 'Unsupported content type.' });
    return null;
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
  if (!body) {
    res.status(400).json({ ok: false, error: 'Invalid request.' });
    return null;
  }

  // Honeypot: a hidden field real visitors never fill; bots usually do. Pretend success.
  if (body.website) {
    res.status(200).json({ ok: true });
    return null;
  }

  if (isRateLimited(`${scope}:${clientIp(req)}`)) {
    res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_MS / 1000));
    res.status(429).json({ ok: false, error: 'Too many requests. Please wait a few minutes and try again.' });
    return null;
  }

  return body;
}

module.exports = { escapeHtml, cleanLine, cleanText, isValidEmail, isValidPhone, getMailer, readFormBody };
