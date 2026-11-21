/**
 * NIVA Power Industries — Footer Newsletter Signup Handler
 * Vercel serverless function (Node.js runtime).
 *
 * 1. Emails each new subscriber's address to the company inbox (nothing is stored).
 * 2. Sends the subscriber a short confirmation email.
 *
 * Because step 2 mails an address typed by a visitor, it is deliberately constrained:
 *  - the message is fixed text; the only visitor-supplied value in it is their own address
 *    (HTML-escaped), so it can't carry attacker-written content;
 *  - at most one confirmation per address per hour (claimConfirmationSlot);
 *  - the shared guard in readFormBody applies: same-origin only, per-IP rate limit, honeypot.
 * For a hard limit across all serverless instances add a Vercel Firewall rate-limit rule on /api/*.
 *
 * SMTP settings: see api/_lib/mailer.js.
 */

const { escapeHtml, cleanLine, isValidEmail, claimConfirmationSlot, getMailer, readFormBody } = require('./_lib/mailer');

const SITE_URL = 'https://www.nivapowerindustries.com/';

function confirmationMessage(email) {
  const text = [
    'Thank you for subscribing to NIVA Power Industries Pvt. Ltd.',
    '',
    'We will send you occasional product updates and company news at this address.',
    '',
    'If you did not request this, or you no longer want to hear from us, just reply to this email',
    'with the word "unsubscribe" and we will remove you.',
    '',
    'NIVA Power Industries Pvt. Ltd.',
    'Powering Progress. Energizing Tomorrow.',
    SITE_URL,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6; max-width: 560px;">
      <h2 style="color: #00215E; margin-bottom: 4px;">Thank you for subscribing</h2>
      <p style="margin-top: 0;">Thank you for subscribing to <strong>NIVA Power Industries Pvt. Ltd.</strong>
      We will send occasional product updates and company news to <strong>${escapeHtml(email)}</strong>.</p>
      <p style="color: #595959;">If you did not request this, or you no longer want to hear from us, simply reply to this
      email with the word &ldquo;unsubscribe&rdquo; and we will remove you.</p>
      <p style="margin-bottom: 0;"><strong style="color: #00215E;">NIVA Power Industries Pvt. Ltd.</strong><br>
      Powering Progress. Energizing Tomorrow.<br>
      <a href="${SITE_URL}">${SITE_URL}</a></p>
    </div>
  `;

  return { subject: 'Thank you for subscribing — NIVA Power Industries', text, html };
}

module.exports = async function handler(req, res) {
  const body = readFormBody(req, res, 'subscribe');
  if (!body) return;

  const email = cleanLine(body.email, 160);
  const page = cleanLine(body.page, 120);

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid business email address.' });
  }

  const mailer = getMailer();
  if (!mailer) {
    console.error('Newsletter signup: SMTP environment variables are not fully configured.');
    return res.status(500).json({ ok: false, error: 'Signup is not available right now. Please try again later.' });
  }

  try {
    await mailer.transporter.sendMail({
      from: mailer.from,
      to: mailer.to,
      replyTo: email,
      subject: `New newsletter subscriber — ${email}`,
      text: [
        `A visitor subscribed to product updates and company news on the NIVA Power Industries website.`,
        ``,
        `Email: ${email}`,
        `Signed up from: ${page || '—'}`,
      ].join('\n'),
      html: `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6;">
          <h2 style="color: #00215E; margin-bottom: 4px;">New Newsletter Subscriber</h2>
          <p style="color: #595959; margin-top: 0;">A visitor subscribed to product updates and company news on the website.</p>
          <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br>
          <strong>Signed up from:</strong> ${escapeHtml(page || '—')}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Newsletter signup: failed to send email.', err);
    return res.status(502).json({ ok: false, error: 'Could not complete your signup right now. Please try again shortly.' });
  }

  // The signup is recorded once the company has been notified. A failed or skipped confirmation
  // (e.g. a mistyped address that the mail server rejects) must not turn that into an error.
  let confirmationSent = false;
  if (claimConfirmationSlot(email)) {
    try {
      await mailer.transporter.sendMail({ from: mailer.publicFrom, to: email, ...confirmationMessage(email) });
      confirmationSent = true;
    } catch (err) {
      console.error('Newsletter signup: confirmation email could not be delivered.', err);
    }
  }

  return res.status(200).json({ ok: true, confirmationSent });
};
