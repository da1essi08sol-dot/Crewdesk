// Sending email for Crewdesk (verification, password reset, security alerts, invites).
// Free Render web services block normal email (SMTP) ports, so mail goes out over HTTPS through an email API:
//   BREVO_API_KEY   — Brevo (free plan: 300 emails a day)            https://www.brevo.com
//   RESEND_API_KEY  — Resend (free plan: 3,000 a month, needs a domain) https://resend.com
//   EMAIL_FROM      — who emails come from, e.g. "Crewdesk <you@yourdomain.co.uk>"
// With no provider set, emails are written to the server log instead (so links can still be found while testing).
'use strict';
const fs = require('fs');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseFrom(v) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(v || '');
  if (m) return { name: m[1].replace(/^"|"$/g, '') || 'Crewdesk', email: m[2].trim() };
  return { name: 'Crewdesk', email: String(v || '').trim() };
}

function provider() {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  return '';
}
const configured = () => !!(provider() && process.env.EMAIL_FROM);

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e3df;border-radius:10px">
<tr><td style="padding:28px 28px 8px"><div style="font-weight:700;font-size:16px;color:#18693f">Crewdesk</div>
<h1 style="font-size:20px;margin:14px 0 0">${esc(title)}</h1></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.55">${bodyHtml}</td></tr></table>
<p style="font-size:12px;color:#77776f;margin:16px 0 0">You’re getting this because of activity on a Crewdesk account using this email address.</p>
</td></tr></table></body></html>`;
}
const button = (url, label) => `<p style="margin:22px 0"><a href="${esc(url)}" style="background:#18693f;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;display:inline-block">${esc(label)}</a></p>
<p style="font-size:13px;color:#55554f;margin:0">Or copy this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>`;

const TEMPLATES = {
  verify: ({ name, url }) => ({
    subject: 'Confirm your email for Crewdesk',
    text: `Hi ${name},\n\nConfirm your email address to finish creating your Crewdesk account:\n${url}\n\nThis link works for 24 hours. If you didn’t sign up, you can ignore this email.`,
    html: layout('Confirm your email', `<p>Hi ${esc(name)},</p><p>Confirm your email address to finish creating your Crewdesk account.</p>${button(url, 'Confirm email')}<p style="font-size:13px;color:#55554f">This link works for 24 hours. If you didn’t sign up, you can ignore this email.</p>`),
  }),
  reset: ({ name, url }) => ({
    subject: 'Reset your Crewdesk password',
    text: `Hi ${name},\n\nSomeone asked to reset the password for your Crewdesk account. If it was you, use this link within 30 minutes:\n${url}\n\nIf it wasn’t you, ignore this email — your password won’t change.`,
    html: layout('Reset your password', `<p>Hi ${esc(name)},</p><p>Someone asked to reset the password for your Crewdesk account. If it was you, choose a new password using the button below. The link works once, for 30 minutes.</p>${button(url, 'Choose a new password')}<p style="font-size:13px;color:#55554f">If it wasn’t you, ignore this email — your password won’t change.</p>`),
  }),
  existing: ({ name, url }) => ({
    subject: 'Someone tried to sign up with your email',
    text: `Hi ${name},\n\nSomeone tried to create a new Crewdesk account with this email address, but you already have one. If that was you, sign in here: ${url}\nIf you’ve forgotten your password, use “Forgot password” on the sign-in page.`,
    html: layout('You already have an account', `<p>Hi ${esc(name)},</p><p>Someone tried to create a new Crewdesk account with this email address, but you already have one. If that was you, just sign in. If you’ve forgotten your password, use “Forgot password” on the sign-in page.</p>${button(url, 'Sign in')}`),
  }),
  locked: ({ name, until, url }) => ({
    subject: 'Your Crewdesk account was locked',
    text: `Hi ${name},\n\nThere were several wrong password attempts on your Crewdesk account, so we’ve locked sign-in until ${until} (UK time).\n\nIf this was you, wait, or reset your password now to unlock it straight away: ${url}\nIf it wasn’t you, someone may be guessing your password. Resetting it is a good idea.`,
    html: layout('Your account was locked', `<p>Hi ${esc(name)},</p><p>There were several wrong password attempts on your Crewdesk account, so we’ve locked sign-in until <b>${esc(until)}</b> (UK time).</p><p>If this was you, wait, or reset your password now to unlock it straight away. If it wasn’t you, someone may be guessing your password, so resetting it is a good idea.</p>${button(url, 'Reset password')}`),
  }),
  changed: ({ name, url }) => ({
    subject: 'Your Crewdesk password was changed',
    text: `Hi ${name},\n\nThe password for your Crewdesk account was just changed, and other devices were signed out. If this wasn’t you, reset your password now: ${url}`,
    html: layout('Your password was changed', `<p>Hi ${esc(name)},</p><p>The password for your Crewdesk account was just changed, and other devices were signed out.</p><p>If this wasn’t you, reset your password now.</p>${button(url, 'Reset password')}`),
  }),
  joinRequest: ({ name, who, company, message, url }) => ({
    subject: `${who} wants to join ${company} on Crewdesk`,
    text: `Hi ${name},\n\n${who} has asked to join ${company} on Crewdesk.${message ? `\n\nTheir message: “${message}”` : ''}\n\nAccept or decline here: ${url}`,
    html: layout(`${who} wants to join ${company}`, `<p>Hi ${esc(name)},</p><p><b>${esc(who)}</b> has asked to join <b>${esc(company)}</b> on Crewdesk.</p>${message ? `<p style="border-left:3px solid #d2cfc7;padding-left:10px;color:#3f3e3a">${esc(message)}</p>` : ''}${button(url, 'Accept or decline')}`),
  }),
  requestAccepted: ({ name, company, url }) => ({
    subject: `You’re in — welcome to ${company} on Crewdesk`,
    text: `Hi ${name},\n\nYour request to join ${company} was accepted. Open Crewdesk to get started: ${url}`,
    html: layout(`Welcome to ${company}`, `<p>Hi ${esc(name)},</p><p>Your request to join <b>${esc(company)}</b> was accepted.</p>${button(url, 'Open Crewdesk')}`),
  }),
  invite: ({ inviter, company, url, expires }) => ({
    subject: `${inviter} invited you to ${company} on Crewdesk`,
    text: `${inviter} invited you to join ${company} on Crewdesk — jobs, photos and team chat in one place.\n\nAccept the invite: ${url}\n${expires ? `The invite expires ${expires}.` : ''}`,
    html: layout(`Join ${company} on Crewdesk`, `<p>${esc(inviter)} invited you to join <b>${esc(company)}</b> on Crewdesk — jobs, photos and team chat in one place.</p>${button(url, 'Accept invite')}${expires ? `<p style="font-size:13px;color:#55554f">The invite expires ${esc(expires)}.</p>` : ''}`),
  }),
};

async function send(to, template, vars) {
  const t = TEMPLATES[template](vars);
  const from = parseFrom(process.env.EMAIL_FROM);
  const p = provider();
  if (process.env.EMAIL_OUTBOX_FILE) { // local testing: write emails to a file instead of sending
    fs.appendFileSync(process.env.EMAIL_OUTBOX_FILE, JSON.stringify({ to, template, subject: t.subject, text: t.text, at: Date.now() }) + '\n');
    return { sent: true, via: 'outbox' };
  }
  if (!p || !from.email) {
    console.log(`\n[email not configured] To: ${to}\nSubject: ${t.subject}\n${t.text}\n`);
    return { sent: false, via: 'log' };
  }
  try {
    let r;
    if (p === 'brevo') {
      r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: from, to: [{ email: to }], subject: t.subject, htmlContent: t.html, textContent: t.text }),
      });
    } else {
      r = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [to], subject: t.subject, html: t.html, text: t.text }),
      });
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error(`Email to ${to} failed (${p} ${r.status}): ${body.slice(0, 300)}`);
      return { sent: false, via: p, error: r.status };
    }
    console.log(`Email sent (${template}) to ${to.replace(/^(.).*(@.*)$/, '$1***$2')} via ${p}`);
    return { sent: true, via: p };
  } catch (e) {
    console.error(`Email to ${to} failed (${p}):`, e.message);
    return { sent: false, via: p, error: e.message };
  }
}

module.exports = { send, configured, provider };
