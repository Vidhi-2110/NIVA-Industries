/**
 * NIVA Power Industries — Contact / RFQ Form Handler
 * Vercel serverless function (Node.js runtime).
 *
 * Receives the "Request a Quotation" form from contact.html and emails it
 * via SMTP to the company inbox, using Nodemailer.
 *
 * Required environment variables (set in Vercel: Project → Settings → Environment Variables):
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   e.g. 465
 *   SMTP_USER   the mailbox that authenticates and sends, e.g. nivaindustries14@gmail.com
 *   SMTP_PASS   the mailbox's app password (NOT the normal account password)
 *   CONTACT_TO  the inbox that should receive enquiries, e.g. nivaindustries14@gmail.com
 */

const nodemailer = require('nodemailer');

const REQUIRED_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company', 'product_interest', 'comments'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: a hidden field real users never fill; bots usually do.
  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  const missing = REQUIRED_FIELDS.filter((key) => !String(body[key] || '').trim());
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` });
  }

  if (!EMAIL_RE.test(String(body.email).trim())) {
    return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
  }

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    CONTACT_TO,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !CONTACT_TO) {
    console.error('Contact form: SMTP environment variables are not fully configured.');
    return res.status(500).json({ ok: false, error: 'Email is not configured on the server yet.' });
  }

  const fields = {
    first_name: String(body.first_name).trim(),
    last_name: String(body.last_name).trim(),
    email: String(body.email).trim(),
    phone: String(body.phone).trim(),
    company: String(body.company).trim(),
    project_location: String(body.project_location || '').trim(),
    product_interest: String(body.product_interest).trim(),
    application_type: String(body.application_type || '').trim(),
    comments: String(body.comments).trim(),
  };

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // true for port 465, false for 587/others (STARTTLS)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const subject = `New RFQ — ${fields.product_interest} — ${fields.company}`;

  const textBody = [
    `New quotation request from the NIVA Power Industries website.`,
    ``,
    `Name: ${fields.first_name} ${fields.last_name}`,
    `Work Email: ${fields.email}`,
    `Phone: ${fields.phone}`,
    `Company / Organization: ${fields.company}`,
    `Project Site Location: ${fields.project_location || '—'}`,
    `Product / Solution of Interest: ${fields.product_interest}`,
    `Application: ${fields.application_type || '—'}`,
    ``,
    `Project Scope & Requirements:`,
    fields.comments,
  ].join('\n');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6;">
      <h2 style="color: #00215E; margin-bottom: 4px;">New Quotation Request</h2>
      <p style="color: #595959; margin-top: 0;">Submitted via the NIVA Power Industries website contact form.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <tr><td style="color:#595959; width:220px;">Name</td><td><strong>${escapeHtml(fields.first_name)} ${escapeHtml(fields.last_name)}</strong></td></tr>
        <tr><td style="color:#595959;">Work Email</td><td><a href="mailto:${escapeHtml(fields.email)}">${escapeHtml(fields.email)}</a></td></tr>
        <tr><td style="color:#595959;">Phone</td><td><a href="tel:${escapeHtml(fields.phone)}">${escapeHtml(fields.phone)}</a></td></tr>
        <tr><td style="color:#595959;">Company / Organization</td><td>${escapeHtml(fields.company)}</td></tr>
        <tr><td style="color:#595959;">Project Site Location</td><td>${escapeHtml(fields.project_location || '—')}</td></tr>
        <tr><td style="color:#595959;">Product / Solution of Interest</td><td>${escapeHtml(fields.product_interest)}</td></tr>
        <tr><td style="color:#595959;">Application</td><td>${escapeHtml(fields.application_type || '—')}</td></tr>
      </table>
      <p style="color:#595959; margin-bottom:4px; margin-top:20px;">Project Scope &amp; Requirements</p>
      <p style="white-space: pre-wrap; border-left: 3px solid #0063EB; padding-left: 12px; margin-top:4px;">${escapeHtml(fields.comments)}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"NIVA Website" <${SMTP_USER}>`,
      to: CONTACT_TO,
      replyTo: `"${fields.first_name} ${fields.last_name}" <${fields.email}>`,
      subject,
      text: textBody,
      html: htmlBody,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form: failed to send email.', err);
    return res.status(502).json({ ok: false, error: 'Could not send your enquiry right now. Please try again shortly.' });
  }
};
