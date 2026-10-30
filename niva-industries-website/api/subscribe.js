/**
 * NIVA Power Industries — Footer Newsletter Signup Handler
 * Vercel serverless function (Node.js runtime).
 *
 * Emails each new subscriber's address to the company inbox. Nothing is stored and
 * nothing is sent to the subscriber, so this can't be used to mail third parties.
 * SMTP settings: see api/_lib/mailer.js.
 */

const { escapeHtml, cleanLine, isValidEmail, getMailer, readFormBody } = require('./_lib/mailer');

module.exports = async function handler(req, res) {
  const body = readFormBody(req, res);
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

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Newsletter signup: failed to send email.', err);
    return res.status(502).json({ ok: false, error: 'Could not complete your signup right now. Please try again shortly.' });
  }
};
