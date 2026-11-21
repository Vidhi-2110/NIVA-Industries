/**
 * NIVA Power Industries — Contact / RFQ Form Handler
 * Vercel serverless function (Node.js runtime).
 *
 * Receives the "Request a Quotation" form from contact.html and emails it
 * via SMTP to the company inbox, then sends the person who filled it in a short
 * acknowledgement at the address they gave. SMTP settings: see api/_lib/mailer.js.
 *
 * Validation (the browser applies the same rules first):
 *  - email: well-formed, and its domain must be able to receive mail (MX / address record);
 *  - phone: exactly 10 digits, first digit 6-9 (an Indian mobile number). "+91", "91" or "0"
 *    prefixes and spaces are accepted and stripped.
 *
 * The acknowledgement mails an address typed by a visitor, so it is fixed text (none of the
 * visitor's own words are echoed back) and limited to one per address per hour.
 */

const { escapeHtml, cleanLine, cleanText, isValidEmail, normalizeMobile, domainCanReceiveMail, getMailer, readFormBody } = require('./_lib/mailer');
const { claimTimedSlot } = require('./_lib/subscribers');

const SITE_URL = 'https://www.nivapowerindustries.com/';
const ACK_INTERVAL_SECONDS = 60 * 60;

function acknowledgementMessage() {
  const text = [
    'Thank you for contacting NIVA Power Industries Pvt. Ltd.',
    '',
    'We have received your enquiry and our team will review it and get back to you as soon as possible.',
    '',
    'If you did not submit this enquiry, you can ignore this email.',
    '',
    'NIVA Power Industries Pvt. Ltd.',
    'Powering Progress. Energizing Tomorrow.',
    SITE_URL,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6; max-width: 560px;">
      <h2 style="color: #00215E; margin-bottom: 4px;">Thank you for contacting us</h2>
      <p style="margin-top: 0;">We have received your enquiry at <strong>NIVA Power Industries Pvt. Ltd.</strong>
      Our team will review it and get back to you as soon as possible.</p>
      <p style="color: #595959;">If you did not submit this enquiry, you can ignore this email.</p>
      <p style="margin-bottom: 0;"><strong style="color: #00215E;">NIVA Power Industries Pvt. Ltd.</strong><br>
      Powering Progress. Energizing Tomorrow.<br>
      <a href="${SITE_URL}">${SITE_URL}</a></p>
    </div>
  `;

  return { subject: 'We have received your enquiry — NIVA Power Industries', text, html };
}

const REQUIRED_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company', 'product_interest', 'comments'];

module.exports = async function handler(req, res) {
  const body = readFormBody(req, res, 'contact');
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
    return res.status(400).json({ ok: false, field: 'email', error: 'Please enter a valid email address, for example name@company.com.' });
  }

  const mobile = normalizeMobile(fields.phone);
  if (!mobile) {
    return res.status(400).json({ ok: false, field: 'phone', error: 'Please enter a valid 10-digit mobile number (digits only, starting with 6, 7, 8 or 9).' });
  }
  fields.phone = mobile;

  // Last, because it needs a network lookup: the address's domain must be able to receive mail.
  if (!(await domainCanReceiveMail(fields.email.split('@')[1]))) {
    return res.status(400).json({ ok: false, field: 'email', error: 'This email address does not look reachable. Please check it for typing mistakes.' });
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
    `Phone: +91 ${fields.phone}`,
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
        <tr><td style="color:#595959;">Phone</td><td><a href="tel:+91${fields.phone}">+91 ${fields.phone}</a></td></tr>
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

  } catch (err) {
    console.error('Contact form: failed to send email.', err);
    return res.status(502).json({ ok: false, error: 'Could not send your enquiry right now. Please try again shortly.' });
  }

  // The enquiry is with the company by now. A failed or skipped acknowledgement must not turn
  // that into an error for the visitor.
  let confirmationSent = false;
  if (await claimTimedSlot('contact-ack', fields.email, ACK_INTERVAL_SECONDS)) {
    try {
      await mailer.transporter.sendMail({ from: mailer.publicFrom, to: fields.email, ...acknowledgementMessage() });
      confirmationSent = true;
    } catch (err) {
      console.error('Contact form: acknowledgement email could not be delivered.', err);
    }
  }

  return res.status(200).json({ ok: true, confirmationSent });
};
