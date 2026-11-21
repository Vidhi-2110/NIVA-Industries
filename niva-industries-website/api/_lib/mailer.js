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

// Indian mobile numbers: exactly 10 digits, first digit 6–9.
const MOBILE_RE = /^[6-9]\d{9}$/;

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
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_RE.test(value)) return false;
  const [local, domain] = value.split('@');
  // RFC limits, and no empty labels such as "a..b@x.com", ".a@x.com" or "a.@x.com".
  return local.length <= 64 && !/^\.|\.$|\.\./.test(local) && !/\.\./.test(domain);
}

// Returns the 10-digit mobile number for input like "9876543210", "98765 43210",
// "+91 98765 43210", "91-9876543210" or "09876543210"; returns null for anything else
// (letters, wrong length, or a first digit outside 6–9).
function normalizeMobile(value) {
  if (typeof value !== 'string' || /[^\d\s+().-]/.test(value)) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return MOBILE_RE.test(digits) ? digits : null;
}

// True when the domain of an email address can receive mail: it has an MX record, or (as mail
// standards allow) an address record. A domain that does not exist, or that publishes a "null MX"
// (such as example.com) to say it takes no mail, is rejected. A DNS timeout or server failure
// returns true, so a flaky lookup never blocks a genuine enquiry.
const DNS_TIMEOUT_MS = 3000;
const NO_RECORD = new Set(['ENODATA', 'ENOTFOUND']);

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function domainCanReceiveMail(domain) {
  const dns = require('dns').promises;
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.some((r) => r.exchange && r.exchange !== '.')) return true;
    if (mx.length > 0) return false; // explicit null MX
  } catch (err) {
    if (!NO_RECORD.has(err.code)) return true; // lookup problem, not a verdict on the domain
  }
  try {
    const a = await withTimeout(dns.resolve4(domain));
    return a.length > 0;
  } catch (err) {
    return !NO_RECORD.has(err.code);
  }
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

module.exports = { escapeHtml, cleanLine, cleanText, isValidEmail, normalizeMobile, domainCanReceiveMail, getMailer, readFormBody };
