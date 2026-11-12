import { Router, Request } from 'express';
import { z } from 'zod';
import { subscriptionsService } from '../services/subscriptions.service';
import { credoService } from '../services/credo.service';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();

// A plan is named by tier (preferred) or by the price id from GET /prices.
const checkoutSchema = z.object({
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/, 'must be a Stripe price id').optional(),
  tier:    z.enum(['premium', 'pro']).optional(),
}).refine((body) => body.priceId || body.tier, { message: 'priceId or tier is required', path: ['priceId'] });

/**
 * GET /api/subscriptions/prices — plans that can be bought right now.
 * Public: the paywall is shown before sign-in too. `{ prices: [] }` means
 * purchases are switched off.
 */
router.get('/prices', async (_req, res) => {
  const prices = await subscriptionsService.listPrices();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ prices });
});

/** GET /api/subscriptions/me */
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const sub = await subscriptionsService.getByUserId(req.user!.sub);
  res.json(sub);
});

/** POST /api/subscriptions/checkout */
router.post('/checkout', requireAuth, validateBody(checkoutSchema), async (req: AuthRequest, res) => {
  const { priceId, tier } = req.body;
  const session = await subscriptionsService.createCheckoutSession(req.user!.sub, { priceId, tier });
  res.json(session);
});

/** POST /api/subscriptions/portal — Stripe billing portal (change plan, card, cancel) */
router.post('/portal', requireAuth, async (req: AuthRequest, res) => {
  const session = await subscriptionsService.createPortalSession(req.user!.sub);
  res.json(session);
});

// ── Credo (eTranzact): naira card and bank-transfer passes ──────────────────

const credoCheckoutSchema = z.object({ tier: z.enum(['premium', 'pro']) });
const credoConfirmSchema = z.object({ reference: z.string().min(1).max(100) });

/** GET /api/subscriptions/credo/plans — public; `{ plans: [] }` when switched off */
router.get('/credo/plans', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ plans: credoService.listPlans() });
});

/** POST /api/subscriptions/credo/checkout → { url, reference } */
router.post('/credo/checkout', requireAuth, validateBody(credoCheckoutSchema), async (req: AuthRequest, res) => {
  res.json(await credoService.createCheckout(req.user!.sub, req.body.tier));
});

/** POST /api/subscriptions/credo/confirm → { status: paid|pending|failed, tier } */
router.post('/credo/confirm', requireAuth, validateBody(credoConfirmSchema), async (req: AuthRequest, res) => {
  res.json(await credoService.confirmForUser(req.user!.sub, req.body.reference));
});

/** POST /api/subscriptions/credo/webhook  (called by Credo) */
router.post('/credo/webhook', async (req: Request, res) => {
  res.json(await credoService.handleWebhook(req.get('x-credo-signature'), req.body));
});

/** POST /api/subscriptions/webhook  (called by Stripe — raw body) */
router.post('/webhook', async (req: Request, res) => {
  const sig = req.headers['stripe-signature'] as string;
  if (!sig) {
    res.status(400).json({ error: 'Missing Stripe signature', code: 'MISSING_SIGNATURE' });
    return;
  }
  const result = await subscriptionsService.handleWebhook(req.body as Buffer, sig);
  res.json(result);
});

export default router;
export { router as subscriptionsRouter };
