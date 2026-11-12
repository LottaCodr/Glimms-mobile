/**
 * The pages that emailed links open: choose a new password, confirm an email.
 *
 * Served by the API itself so the links work in any browser, with no web app
 * and whether or not the mobile app is installed. Plain HTML forms, no script.
 */
import express, { Router, Response } from 'express';
import { authService } from '../services/auth.service';
import { authLimiter } from '../middleware/rateLimiter.middleware';
import { AppError } from '../middleware/errorHandler.middleware';
import { escapeHtml } from '../lib/mailer';
import { credoService } from '../services/credo.service';
import { config } from '../config';

/** URL scheme of the mobile app, e.g. `glimms`. */
const APP_SCHEME = /^[a-z][a-z0-9+.-]*(?=:)/i.exec(config.credo.appReturnUrl)?.[0] ?? 'glimms';

const router = Router();
router.use(express.urlencoded({ extended: false, limit: '10kb' }));

function page(res: Response, status: number, title: string, body: string): void {
  res
    .status(status)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      // The URL carries a one-time token: keep it out of caches and referrers.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${APP_SCHEME}:; base-uri 'none'; frame-ancestors 'none'`,
    })
    .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Glimms</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0E0E0E;color:#EDE8DF;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;padding:24px;box-sizing:border-box}
main{width:100%;max-width:400px;background:#171717;border:1px solid #2A2A2A;border-radius:20px;padding:32px;box-sizing:border-box}
h1{margin:0 0 12px;font-size:24px;color:#D4B478;font-weight:600}
p{line-height:1.5;margin:0 0 16px;color:#C9C3B8}
label{display:block;font-size:13px;margin:0 0 6px;color:#C9C3B8}
input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #3A3A3A;background:#0E0E0E;color:#EDE8DF;font-size:16px;margin:0 0 16px}
input:focus{outline:2px solid #BF9245;outline-offset:1px}
button{width:100%;padding:14px;border:0;border-radius:14px;background:#BF9245;color:#0E0E0E;font-size:16px;font-weight:700;cursor:pointer}
.error{color:#F0857A}
</style></head><body><main>
<h1>${escapeHtml(title)}</h1>
${body}
</main></body></html>`);
}

const expired = (res: Response, what: string) =>
  page(res, 400, 'Link expired', `<p>This ${what} link is invalid, was already used, or has expired.</p>
<p>Open the Glimms app and request a new one.</p>`);

function resetForm(res: Response, token: string, error?: string): void {
  page(res, error ? 400 : 200, 'Choose a new password', `
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/account/reset-password">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label for="password">New password (at least 8 characters)</label>
<input id="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="200" required autofocus>
<label for="confirm">Repeat the new password</label>
<input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="200" required>
<button type="submit">Update password</button>
</form>`);
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

router.get('/reset-password', authLimiter, async (req, res) => {
  const token = asString(req.query.token);
  if (!(await authService.isPasswordResetTokenValid(token))) return expired(res, 'password reset');
  resetForm(res, token);
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const token = asString(req.body?.token);
  const password = asString(req.body?.password);
  if (!(await authService.isPasswordResetTokenValid(token))) return expired(res, 'password reset');
  if (password.length < 8 || password.length > 200) {
    return resetForm(res, token, 'The password must be between 8 and 200 characters.');
  }
  if (password !== asString(req.body?.confirm)) return resetForm(res, token, 'The two passwords do not match.');

  try {
    await authService.resetPassword(token, password);
  } catch (err) {
    if (err instanceof AppError && err.code === 'INVALID_TOKEN') return expired(res, 'password reset');
    throw err;
  }
  page(res, 200, 'Password updated', `<p>Your password has been changed and every device was signed out.</p>
<p>Return to the Glimms app and sign in with your new password.</p>`);
});

// Confirming is a POST behind a button: mail scanners that pre-fetch links
// must not be able to use up the token.
router.get('/verify-email', authLimiter, (req, res) => {
  const token = asString(req.query.token);
  if (!token) return expired(res, 'confirmation');
  page(res, 200, 'Confirm your email', `<p>Press the button to confirm this email address for your Glimms account.</p>
<form method="post" action="/account/verify-email">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit">Confirm email</button>
</form>`);
});

router.post('/verify-email', authLimiter, async (req, res) => {
  try {
    await authService.verifyEmail(asString(req.body?.token));
  } catch (err) {
    if (err instanceof AppError && err.code === 'INVALID_TOKEN') return expired(res, 'confirmation');
    throw err;
  }
  page(res, 200, 'Email confirmed', '<p>Thanks. Your email address is confirmed. You can return to the Glimms app.</p>');
});

// Where Credo sends the browser after checkout. The payment is re-checked with
// Credo here; the query string itself proves nothing.
router.get('/credo/return', authLimiter, async (req, res) => {
  const reference = [req.query.transRef, req.query.reference, req.query.transactionRef]
    .map(asString).find((value) => value && value.length <= 100) ?? '';

  let outcome: string;
  try {
    outcome = await credoService.confirmFromRedirect(reference);
  } catch {
    outcome = 'pending'; // Credo unreachable: the webhook or the sweep will finish it
  }

  const copy: Record<string, [string, string]> = {
    paid:    ['Payment received', 'Thank you. Your plan is now active.'],
    pending: ['Payment processing', 'We have not received confirmation yet. Your plan activates as soon as the payment clears.'],
    failed:  ['Payment not completed', 'No plan was activated. You can try again from the app.'],
    unknown: ['Payment not found', 'We could not match this payment. If you were charged, contact support.'],
  };
  const [title, message] = copy[outcome] ?? copy.unknown;
  const appUrl = `${config.credo.appReturnUrl}?status=${encodeURIComponent(outcome)}`;

  // Navigating to the app's own URL scheme hands control back to the app.
  res.set('Refresh', `0; url=${appUrl}`);
  page(res, 200, title, `<p>${escapeHtml(message)}</p>
<form method="get" action="${escapeHtml(config.credo.appReturnUrl)}">
<input type="hidden" name="status" value="${escapeHtml(outcome)}">
<button type="submit">Return to Glimms</button>
</form>`);
});

export { router as accountPagesRouter };
