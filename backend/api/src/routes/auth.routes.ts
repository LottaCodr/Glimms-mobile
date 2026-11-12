import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { validateBody } from '../middleware/validate.middleware';
import { authLimiter } from '../middleware/rateLimiter.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name:     z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// POST /api/auth/register
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const tokens = await authService.register(req.body);
  res.status(201).json(tokens);
});

// POST /api/auth/login
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const tokens = await authService.login(req.body);
  res.json(tokens);
});

// POST /api/auth/refresh
router.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.json(tokens);
});

// POST /api/auth/logout
router.post('/logout', validateBody(refreshSchema), async (req, res) => {
  const result = await authService.logout(req.body.refreshToken);
  res.json(result);
});

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(200);

const googleSchema = z.object({ idToken: z.string().min(1).max(8192) });
const appleSchema = z.object({
  identityToken: z.string().min(1).max(8192),
  // Apple only shares the name with the app, and only on the first sign-in.
  name: z.string().min(1).max(100).optional(),
});
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(1).max(200), password: passwordSchema });
const verifySchema = z.object({ token: z.string().min(1).max(200) });

// POST /api/auth/google — sign in or up with a Google ID token
router.post('/google', authLimiter, validateBody(googleSchema), async (req, res) => {
  res.json(await authService.socialSignIn('google', req.body.idToken));
});

// POST /api/auth/apple — sign in or up with an Apple identity token
router.post('/apple', authLimiter, validateBody(appleSchema), async (req, res) => {
  res.json(await authService.socialSignIn('apple', req.body.identityToken, req.body.name));
});

// POST /api/auth/forgot-password — always 200, whether or not the account exists
router.post('/forgot-password', authLimiter, validateBody(forgotSchema), async (req, res) => {
  res.json(await authService.requestPasswordReset(req.body.email));
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, validateBody(resetSchema), async (req, res) => {
  res.json(await authService.resetPassword(req.body.token, req.body.password));
});

// POST /api/auth/verify-email
router.post('/verify-email', authLimiter, validateBody(verifySchema), async (req, res) => {
  res.json(await authService.verifyEmail(req.body.token));
});

// POST /api/auth/resend-verification
router.post('/resend-verification', requireAuth, authLimiter, async (req: AuthRequest, res) => {
  res.json(await authService.resendVerification(req.user!.sub));
});

export default router;
