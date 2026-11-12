import sgMail from '@sendgrid/mail';
import { config } from '../config';
import { logger } from './logger';

if (config.sendgrid.apiKey) sgMail.setApiKey(config.sendgrid.apiKey);

export interface Mail { to: string; subject: string; html: string; text: string }

export const mailer = {
  isConfigured(): boolean {
    return !!config.sendgrid.apiKey;
  },

  /** Throws when the provider rejects the message. A no-op (logged) when email is not configured. */
  async send(mail: Mail): Promise<void> {
    if (!config.sendgrid.apiKey) {
      logger.warn({ to: mail.to, subject: mail.subject }, 'SendGrid not configured — email skipped');
      return;
    }
    await sgMail.send({ ...mail, from: config.sendgrid.fromEmail });
    logger.info({ subject: mail.subject }, 'Email sent');
  },
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string
  ));
}

function layout(heading: string, paragraphs: string[], action: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0E0E0E;font-family:Helvetica,Arial,sans-serif;color:#EDE8DF">
<div style="max-width:480px;margin:0 auto;background:#171717;border-radius:16px;padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;color:#D4B478">${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(p)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#BF9245;color:#0E0E0E;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:12px;display:inline-block">${escapeHtml(action.label)}</a></p>
<p style="margin:0;font-size:12px;color:#8A857C;word-break:break-all">Or open this link: ${escapeHtml(action.url)}</p>
</div></body></html>`;
}

export const emails = {
  passwordReset(to: string, url: string, minutes: number): Mail {
    const lines = [
      'We received a request to reset the password for your Glimms account.',
      `This link works once and expires in ${minutes} minutes. If you did not ask for it, you can ignore this email and your password stays the same.`,
    ];
    return {
      to,
      subject: 'Reset your Glimms password',
      html: layout('Reset your password', lines, { label: 'Choose a new password', url }),
      text: `${lines.join('\n\n')}\n\n${url}\n`,
    };
  },

  verifyEmail(to: string, name: string | null, url: string): Mail {
    const lines = [
      `Hi ${name ?? 'there'}, welcome to Glimms.`,
      'Confirm this is your email address so you can recover your account if you ever lose access.',
    ];
    return {
      to,
      subject: 'Confirm your email for Glimms',
      html: layout('Confirm your email', lines, { label: 'Confirm email', url }),
      text: `${lines.join('\n\n')}\n\n${url}\n`,
    };
  },

  passwordChanged(to: string): Mail {
    const lines = [
      'The password for your Glimms account was just changed and every device was signed out.',
      'If this was not you, reset your password now from the sign-in screen.',
    ];
    return {
      to,
      subject: 'Your Glimms password was changed',
      html: `<p>${lines.map(escapeHtml).join('</p><p>')}</p>`,
      text: `${lines.join('\n\n')}\n`,
    };
  },
};
