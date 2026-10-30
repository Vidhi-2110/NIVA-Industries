/**
 * NIVA Power Industries — Contact / RFQ Form Handler
 * Vercel serverless function (Node.js runtime).
 *
 * Receives the "Request a Quotation" form from contact.html and emails it
 * via SMTP to the company inbox. SMTP settings: see api/_lib/mailer.js.
 */

const { escapeHtml, cleanLine, cleanText, isValidEmail, getMailer, readFormBody } = require('./_lib/mailer');

const REQUIRED_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company', 'product_interest', 'comments'];

module.exports = async function handler(req, res) {
  const body = readFormBody(req, res);
  if (!body) return;

  const fields = {
    first_name: cleanLine(body.first_name, 80),
    last_name: cleanLine(body.last_name, 80),
    email: cleanLine(body.email, 160),
    phone: cleanLine(body.phone, 40),
    company: cleanLine(body.company, 160),
    project_location: cleanLine(body.project_location, 160),
    product_interest: cleanLine(body.product_interest, 80),
    application_type: cleanLine(body.application_type, 80),
    comments: cleanText(body.comments, 5000),
  };

  const missing = REQUIRED_FIELDS.filter((key) => !fields[key]);
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` });
  }

  if (!isValidEmail(fields.email)) {
    return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
  }

  const mailer = getMailer();
  if (!mailer) {
    console.error('Contact form: SMTP environment variables are not fully configured.');
    return res.status(500).json({ ok: false, error: 'Email is not configured on the server yet.' });
  }

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
    await mailer.transporter.sendMail({
      from: mailer.from,
      to: mailer.to,
      replyTo: { name: `${fields.first_name} ${fields.last_name}`, address: fields.email },
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
